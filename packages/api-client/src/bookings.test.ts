import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("./api-client", () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}));

import {
  cancelBooking,
  createBooking,
  getBooking,
  getBookings,
  getServiceAvailability,
} from "./bookings";
import type {
  Booking,
  CreateBookingData,
  ServiceAvailabilityResponse,
} from "./bookings";

const bookingService = {
  id: 3,
  name: "AC Repair",
  slug: "ac-repair",
  description: "Cooling repair service.",
  price_min: "1500.00",
  price_max: "3500.00",
  duration_minutes: 60,
  is_published: true,
  created_at: "2026-11-23T10:00:00.000000Z",
  updated_at: "2026-11-23T10:00:00.000000Z",
};

const booking: Booking = {
  id: 11,
  user_id: 7,
  service_id: 3,
  address_id: 4,
  technician_id: null,
  scheduled_slot_start: "2026-11-24T09:00:00.000000Z",
  scheduled_slot_end: "2026-11-24T10:00:00.000000Z",
  status: "pending",
  problem_description: "AC not cooling",
  final_price: null,
  cancelled_at: null,
  rescheduled_from_id: null,
  created_at: "2026-11-23T10:00:00.000000Z",
  updated_at: "2026-11-23T10:00:00.000000Z",
  service: bookingService,
};

const createBookingResponse: { booking: Booking } = {
  booking: {
    id: 11,
    user_id: 7,
    service_id: 3,
    address_id: 4,
    scheduled_slot_start: "2026-11-24T09:00:00.000000Z",
    scheduled_slot_end: "2026-11-24T10:00:00.000000Z",
    status: "pending",
    problem_description: "AC not cooling",
    created_at: "2026-11-23T10:00:00.000000Z",
    updated_at: "2026-11-23T10:00:00.000000Z",
    service: bookingService,
  },
};

const availability: ServiceAvailabilityResponse = {
  service: { id: 3, slug: "ac-repair", duration_minutes: 60 },
  date: "2026-11-24",
  timezone: "Asia/Karachi",
  slots: [{ start: "2026-11-24T09:00:00+05:00", end: "2026-11-24T10:00:00+05:00" }],
};

const createPayload: CreateBookingData = {
  service_id: 3,
  scheduled_slot_start: "2026-11-24T09:00:00+05:00",
  scheduled_slot_end: "2026-11-24T10:00:00+05:00",
  address_id: 4,
  problem_description: "AC not cooling",
};

function apiError(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, data },
  });
}

describe("bookings", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("getServiceAvailability calls GET /services/{slug}/availability with date param and unwraps envelope", async () => {
    mockGet.mockResolvedValue({ data: availability });

    const result = await getServiceAvailability("ac-repair", "2026-11-24");

    expect(mockGet).toHaveBeenCalledWith("/services/ac-repair/availability", {
      params: { date: "2026-11-24" },
    });
    expect(result).toEqual(availability);
  });

  it("getServiceAvailability passes mode=nearest when requested", async () => {
    const withNearest = { ...availability, nearest_slot: availability.slots[0] };
    mockGet.mockResolvedValue({ data: withNearest });

    const result = await getServiceAvailability("ac-repair", "2026-11-24", "nearest");

    expect(mockGet).toHaveBeenCalledWith("/services/ac-repair/availability", {
      params: { date: "2026-11-24", mode: "nearest" },
    });
    expect(result).toEqual(withNearest);
  });

  it("getServiceAvailability propagates 404", async () => {
    mockGet.mockRejectedValue(apiError(404, { message: "Not Found" }));

    await expect(getServiceAvailability("missing", "2026-11-24")).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it("getServiceAvailability propagates 422 validation errors", async () => {
    mockGet.mockRejectedValue(apiError(422, { message: "The given data was invalid.", errors: { date: ["The date cannot be in the past."] } }));

    await expect(getServiceAvailability("ac-repair", "2020-01-01")).rejects.toMatchObject({
      response: { status: 422, data: { errors: { date: ["The date cannot be in the past."] } } },
    });
  });

  it("getServiceAvailability propagates 401", async () => {
    mockGet.mockRejectedValue(apiError(401, { message: "Unauthenticated." }));

    await expect(getServiceAvailability("ac-repair", "2026-11-24")).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it("createBooking POSTs exact body to /bookings and unwraps booking envelope", async () => {
    mockPost.mockResolvedValue({ data: createBookingResponse });

    const result = await createBooking(createPayload);

    expect(mockPost).toHaveBeenCalledWith("/bookings", createPayload);
    expect(result).toEqual(createBookingResponse);
    expect(result.booking).not.toHaveProperty("technician_id");
    expect(result.booking).not.toHaveProperty("final_price");
    expect(result.booking).not.toHaveProperty("cancelled_at");
    expect(result.booking).not.toHaveProperty("rescheduled_from_id");
  });

  it("createBooking propagates 404", async () => {
    mockPost.mockRejectedValue(apiError(404, { message: "Not Found" }));

    await expect(createBooking(createPayload)).rejects.toMatchObject({ response: { status: 404 } });
  });

  it("createBooking propagates 422 validation errors bag", async () => {
    mockPost.mockRejectedValue(apiError(422, { message: "The given data was invalid.", errors: { service_id: ["The selected service id is invalid."] } }));

    await expect(createBooking(createPayload)).rejects.toMatchObject({
      response: { status: 422, data: { errors: { service_id: ["The selected service id is invalid."] } } },
    });
  });

  it("createBooking propagates slot-conflict 422 with server message", async () => {
    mockPost.mockRejectedValue(apiError(422, { message: "This time slot is no longer available. Please choose a different time." }));

    await expect(createBooking(createPayload)).rejects.toMatchObject({
      response: { status: 422, data: { message: "This time slot is no longer available. Please choose a different time." } },
    });
  });

  it("createBooking propagates 401", async () => {
    mockPost.mockRejectedValue(apiError(401, { message: "Unauthenticated." }));

    await expect(createBooking(createPayload)).rejects.toMatchObject({ response: { status: 401 } });
  });

  it("getBookings calls GET /bookings and unwraps bookings paginator envelope", async () => {
    const envelope = {
      bookings: {
        data: [booking],
        current_page: 1,
        first_page_url: "http://localhost/api/v1/bookings?page=1",
        from: 1,
        last_page: 1,
        last_page_url: "http://localhost/api/v1/bookings?page=1",
        links: [
          { url: null, label: "&laquo; Previous", active: false, page: null },
          { url: "http://localhost/api/v1/bookings?page=1", label: "1", active: true, page: 1 },
          { url: null, label: "Next &raquo;", active: false, page: null },
        ],
        next_page_url: null,
        path: "http://localhost/api/v1/bookings",
        per_page: 15,
        prev_page_url: null,
        to: 1,
        total: 1,
      },
    };
    mockGet.mockResolvedValue({ data: envelope });

    const result = await getBookings();

    expect(mockGet).toHaveBeenCalledWith("/bookings", { params: undefined });
    expect(result).toEqual(envelope);
  });

  it("getBookings passes page when provided", async () => {
    mockGet.mockResolvedValue({
      data: {
        bookings: {
          data: [],
          current_page: 2,
          first_page_url: "http://localhost/api/v1/bookings?page=1",
          from: null,
          last_page: 2,
          last_page_url: "http://localhost/api/v1/bookings?page=2",
          links: [],
          next_page_url: null,
          path: "http://localhost/api/v1/bookings",
          per_page: 15,
          prev_page_url: "http://localhost/api/v1/bookings?page=1",
          to: null,
          total: 0,
        },
      },
    });

    await getBookings(2);

    expect(mockGet).toHaveBeenCalledWith("/bookings", { params: { page: 2 } });
  });

  it("getBookings propagates 404, 422, 401", async () => {
    mockGet.mockRejectedValueOnce(apiError(404, { message: "Not Found" }));
    await expect(getBookings()).rejects.toMatchObject({ response: { status: 404 } });

    mockGet.mockRejectedValueOnce(apiError(422, { message: "The given data was invalid.", errors: { page: ["bad"] } }));
    await expect(getBookings()).rejects.toMatchObject({ response: { status: 422 } });

    mockGet.mockRejectedValueOnce(apiError(401, { message: "Unauthenticated." }));
    await expect(getBookings()).rejects.toMatchObject({ response: { status: 401 } });
  });

  it("getBooking calls GET /bookings/{id} and unwraps booking envelope", async () => {
    mockGet.mockResolvedValue({ data: { booking } });

    const result = await getBooking(11);

    expect(mockGet).toHaveBeenCalledWith("/bookings/11");
    expect(result).toEqual({ booking });
  });

  it("getBooking propagates 404, 422, 401", async () => {
    mockGet.mockRejectedValueOnce(apiError(404, { message: "Not Found" }));
    await expect(getBooking(11)).rejects.toMatchObject({ response: { status: 404 } });

    mockGet.mockRejectedValueOnce(apiError(422, { message: "The given data was invalid.", errors: { id: ["bad"] } }));
    await expect(getBooking(11)).rejects.toMatchObject({ response: { status: 422 } });

    mockGet.mockRejectedValueOnce(apiError(401, { message: "Unauthenticated." }));
    await expect(getBooking(11)).rejects.toMatchObject({ response: { status: 401 } });
  });

  it("cancelBooking POSTs to /bookings/{id}/cancel with no body and unwraps booking envelope", async () => {
    const cancelled = { ...booking, status: "cancelled" as const, cancelled_at: "2026-11-23T10:05:00.000000Z" };
    mockPost.mockResolvedValue({ data: { booking: cancelled } });

    const result = await cancelBooking(11);

    expect(mockPost).toHaveBeenCalledWith("/bookings/11/cancel");
    expect(result).toEqual({ booking: cancelled });
  });

  it("cancelBooking propagates 404", async () => {
    mockPost.mockRejectedValue(apiError(404, { message: "Not Found" }));
    await expect(cancelBooking(11)).rejects.toMatchObject({ response: { status: 404 } });
  });

  it("cancelBooking propagates 422 cutoff rejection with server message", async () => {
    mockPost.mockRejectedValue(apiError(422, { message: "Bookings can only be cancelled at least 120 minutes before the scheduled slot." }));

    await expect(cancelBooking(11)).rejects.toMatchObject({
      response: { status: 422, data: { message: "Bookings can only be cancelled at least 120 minutes before the scheduled slot." } },
    });
  });

  it("cancelBooking propagates 401", async () => {
    mockPost.mockRejectedValue(apiError(401, { message: "Unauthenticated." }));
    await expect(cancelBooking(11)).rejects.toMatchObject({ response: { status: 401 } });
  });
});
