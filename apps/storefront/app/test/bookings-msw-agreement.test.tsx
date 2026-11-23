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
});
