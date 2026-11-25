import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelBooking,
  createBooking,
  getBooking,
  getBookings,
  getServiceAvailability,
  useAuthStore,
} from "@ecommerce/api-client";
import { callCounts, session } from "./handlers";
import { resetBookingsSource, setBookingCancelCutoffError, setBookingConflictError } from "./handlers-bookings";
import { recordedRequests } from "./server";

const testUser = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 2, name: "Customer", slug: "customer" },
};

describe("bookings MSW agreement (BK-0 contract)", () => {
  beforeEach(() => {
    resetBookingsSource();
    setBookingConflictError(false);
    setBookingCancelCutoffError(false);
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
  });

  afterEach(() => {
    session.end();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isSessionChecked: false,
    });
  });

  it("GET /services/{slug}/availability returns service/date/timezone/slots envelope", async () => {
    const result = await getServiceAvailability("ac-repair", "2026-11-24");

    expect(callCounts.bookingAvailability).toBe(1);
    expect(result).toMatchObject({
      service: { slug: "ac-repair", duration_minutes: 60 },
      date: "2026-11-24",
      timezone: "Asia/Karachi",
    });
    expect(Array.isArray(result.slots)).toBe(true);
    expect(result.slots[0]).toMatchObject({
      start: expect.any(String),
      end: expect.any(String),
    });
    expect(recordedRequests).toContain("GET /api/v1/services/ac-repair/availability");
  });

  it("GET /services/{slug}/availability with mode=nearest returns nearest_slot", async () => {
    const result = await getServiceAvailability("ac-repair", "2026-11-24", "nearest");

    expect(result.nearest_slot === null || typeof result.nearest_slot === "object").toBe(true);
    const req = recordedRequests.find((r) => r.includes("/api/v1/services/ac-repair/availability"));
    expect(req).toBeDefined();
  });

  it("POST /bookings returns 201 { booking } with pending status", async () => {
    const result = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T04:00:00.000Z",
      scheduled_slot_end: "2026-11-24T05:00:00.000Z",
      address_id: 1,
      problem_description: "AC not cooling",
    });

    expect(callCounts.bookingCreate).toBe(1);
    expect(result.booking).toMatchObject({
      user_id: 7,
      service_id: 1,
      status: "pending",
      problem_description: "AC not cooling",
    });
    expect(recordedRequests).toContain("POST /api/v1/bookings");
  });

  it("POST /bookings conflict returns 422 with real server message", async () => {
    setBookingConflictError(true);

    await expect(
      createBooking({
        service_id: 1,
        scheduled_slot_start: "2026-11-24T04:00:00.000Z",
        scheduled_slot_end: "2026-11-24T05:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      response: {
        status: 422,
        data: { message: "This time slot is no longer available. Please choose a different time." },
      },
    });
  });

  it("GET /bookings returns paginator envelope under bookings key", async () => {
    await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T04:00:00.000Z",
      scheduled_slot_end: "2026-11-24T05:00:00.000Z",
    });

    const result = await getBookings();

    expect(callCounts.bookings).toBe(1);
    expect(result.bookings).toMatchObject({
      data: expect.any(Array),
      total: expect.any(Number),
      per_page: expect.any(Number),
      current_page: expect.any(Number),
    });
    expect(result.bookings.total).toBe(1);
    expect(recordedRequests).toContain("GET /api/v1/bookings");
  });

  it("GET /bookings/{id} returns booking detail envelope", async () => {
    const created = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T04:00:00.000Z",
      scheduled_slot_end: "2026-11-24T05:00:00.000Z",
    });

    const result = await getBooking(created.booking.id);

    expect(callCounts.bookingShow).toBe(1);
    expect(result.booking).toMatchObject({ id: created.booking.id, status: "pending" });
    expect(recordedRequests).toContain(`GET /api/v1/bookings/${created.booking.id}`);
  });

  it("POST /bookings/{id}/cancel returns cancelled booking", async () => {
    const created = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T04:00:00.000Z",
      scheduled_slot_end: "2026-11-24T05:00:00.000Z",
    });

    const result = await cancelBooking(created.booking.id);

    expect(callCounts.bookingCancel).toBe(1);
    expect(result.booking.status).toBe("cancelled");
    expect(recordedRequests).toContain(`POST /api/v1/bookings/${created.booking.id}/cancel`);
  });

  it("cancel cutoff rejection returns 422 with real server message", async () => {
    const created = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T04:00:00.000Z",
      scheduled_slot_end: "2026-11-24T05:00:00.000Z",
    });
    setBookingCancelCutoffError(true);

    await expect(cancelBooking(created.booking.id)).rejects.toMatchObject({
      response: {
        status: 422,
        data: {
          message: "Bookings can only be cancelled at least 120 minutes before the scheduled slot.",
        },
      },
    });
  });

  it("unknown booking returns 404 with Not Found message", async () => {
    await expect(getBooking(999999)).rejects.toMatchObject({
      response: { status: 404, data: { message: "Not Found" } },
    });
  });

  it("availability slots use +05:00 business-timezone offset strings", async () => {
    const result = await getServiceAvailability("ac-repair", "2026-11-24");
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:00$/);
    expect(result.slots[0].end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:00$/);
  });

  it("create response omits technician_id/final_price/cancelled_at/rescheduled_from_id and includes full service object", async () => {
    const result = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T09:00:00+05:00",
      scheduled_slot_end: "2026-11-24T10:00:00+05:00",
    });

    expect(result.booking).not.toHaveProperty("technician_id");
    expect(result.booking).not.toHaveProperty("final_price");
    expect(result.booking).not.toHaveProperty("cancelled_at");
    expect(result.booking).not.toHaveProperty("rescheduled_from_id");
    expect(result.booking.service).toMatchObject({
      id: expect.any(Number),
      name: expect.any(String),
      slug: expect.any(String),
      description: expect.anything(),
      price_min: expect.any(String),
      price_max: expect.any(String),
      duration_minutes: expect.any(Number),
      is_published: expect.any(Boolean),
      created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
      updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
    });
    expect(result.booking.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });

  it("show and list responses include technician_id/final_price/cancelled_at/rescheduled_from_id", async () => {
    const created = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T09:00:00+05:00",
      scheduled_slot_end: "2026-11-24T10:00:00+05:00",
    });
    const show = await getBooking(created.booking.id);
    expect(show.booking).toHaveProperty("technician_id", null);
    expect(show.booking).toHaveProperty("final_price", null);
    expect(show.booking).toHaveProperty("cancelled_at", null);
    expect(show.booking).toHaveProperty("rescheduled_from_id", null);

    const list = await getBookings();
    const item = list.bookings.data.find((b) => b.id === created.booking.id);
    expect(item).toBeDefined();
    expect(item).toHaveProperty("technician_id", null);
    expect(item).toHaveProperty("final_price", null);
    expect(item).toHaveProperty("cancelled_at", null);
    expect(item).toHaveProperty("rescheduled_from_id", null);
  });

  it("list returns full Laravel paginator shape and honours ?page", async () => {
    await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T09:00:00+05:00",
      scheduled_slot_end: "2026-11-24T10:00:00+05:00",
    });
    const result = await getBookings(2);
    expect(result.bookings).toMatchObject({
      current_page: 2,
      data: expect.any(Array),
      first_page_url: expect.any(String),
      from: null,
      last_page: expect.any(Number),
      last_page_url: expect.any(String),
      links: expect.any(Array),
      next_page_url: null,
      path: expect.any(String),
      per_page: 15,
      prev_page_url: expect.any(String),
      to: null,
      total: expect.any(Number),
    });
    expect(result.bookings.links[0]).toMatchObject({
      url: expect.anything(),
      label: expect.any(String),
      active: expect.any(Boolean),
    });
  });

  it("real overlap conflict against stored booking returns 422 with real message; cancelled booking frees slot", async () => {
    const first = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T09:00:00+05:00",
      scheduled_slot_end: "2026-11-24T10:00:00+05:00",
    });
    await expect(
      createBooking({
        service_id: 1,
        scheduled_slot_start: "2026-11-24T09:00:00+05:00",
        scheduled_slot_end: "2026-11-24T10:00:00+05:00",
      }),
    ).rejects.toMatchObject({
      response: {
        status: 422,
        data: { message: "This time slot is no longer available. Please choose a different time." },
      },
    });

    await cancelBooking(first.booking.id);
    const afterCancel = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T09:00:00+05:00",
      scheduled_slot_end: "2026-11-24T10:00:00+05:00",
    });
    expect(afterCancel.booking.status).toBe("pending");
  });

  it("cancelling an already cancelled booking returns 422 with real message", async () => {
    const created = await createBooking({
      service_id: 1,
      scheduled_slot_start: "2026-11-24T09:00:00+05:00",
      scheduled_slot_end: "2026-11-24T10:00:00+05:00",
    });
    await cancelBooking(created.booking.id);
    await expect(cancelBooking(created.booking.id)).rejects.toMatchObject({
      response: {
        status: 422,
        data: { message: "This booking has already been cancelled." },
      },
    });
  });

  it("booking with an address_id the user does not own returns 404 Not Found", async () => {
    await expect(
      createBooking({
        service_id: 1,
        scheduled_slot_start: "2026-11-24T09:00:00+05:00",
        scheduled_slot_end: "2026-11-24T10:00:00+05:00",
        address_id: 999999,
      }),
    ).rejects.toMatchObject({
      response: { status: 404, data: { message: "Not Found" } },
    });
  });
});
