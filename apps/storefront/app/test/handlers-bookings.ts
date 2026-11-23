import { http, HttpResponse } from "msw";
import type { Booking, BookingStatus } from "@ecommerce/api-client";
import { API_URL, callCounts, session } from "./handlers";

/**
 * Single source of truth for booking MSW handlers (availability, create, list,
 * detail, cancel). Mirrors the real server contract (BK-0 STEP 0, 2026-11-23):
 * - GET  /services/{slug}/availability?date=YYYY-MM-DD[&mode=nearest]
 *        -> 200 { service, date, timezone, slots, nearest_slot? }
 *        404 when service missing/not published; 422 validation errors.
 * - POST /bookings          -> 201 { booking } (service loaded)
 * - GET  /bookings          -> 200 { bookings: paginator }
 * - GET  /bookings/{id}     -> 200 { booking } (service loaded)
 * - POST /bookings/{id}/cancel -> 200 { booking }
 * Ownership/unknown booking -> 404 { message: "Not Found" }
 * Conflict (slot taken) -> 422 { message: "This time slot is no longer available. Please choose a different time." }
 * Cancel cutoff -> 422 { message: "Bookings can only be cancelled at least 120 minutes before the scheduled slot." }
 *
 * No customer reschedule endpoint exists on the server. No attachments in
 * StoreBookingRequest.
 */

interface AvailabilityService {
  id: number;
  slug: string;
  duration_minutes: number;
}

const defaultAvailabilityService: AvailabilityService = {
  id: 1,
  slug: "ac-repair",
  duration_minutes: 60,
};

let availabilityService: AvailabilityService = { ...defaultAvailabilityService };

interface TestBooking extends Booking {}

let bookings: TestBooking[] = [];
let nextBookingId = 100;
let forceConflict = false;
let forceCancelCutoff = false;

function cloneBooking(booking: TestBooking): TestBooking {
  return { ...booking, service: booking.service ? { ...booking.service } : undefined };
}

function guard(): HttpResponse<{ message: string }> | null {
  if (!session.active) {
    return HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });
  }
  return null;
}

function notFound(): HttpResponse<{ message: string }> {
  return HttpResponse.json({ message: "Not Found" }, { status: 404 });
}

function validationError(errors: Record<string, string[]>): HttpResponse<{ message: string; errors: Record<string, string[]> }> {
  return HttpResponse.json(
    { message: "The given data was invalid.", errors },
    { status: 422 },
  );
}

function conflictError(): HttpResponse<{ message: string }> {
  return HttpResponse.json(
    { message: "This time slot is no longer available. Please choose a different time." },
    { status: 422 },
  );
}

function cutoffError(): HttpResponse<{ message: string }> {
  return HttpResponse.json(
    { message: "Bookings can only be cancelled at least 120 minutes before the scheduled slot." },
    { status: 422 },
  );
}

function asBookingStatus(value: unknown): BookingStatus {
  const allowed: BookingStatus[] = [
    "pending",
    "confirmed",
    "technician_on_the_way",
    "completed",
    "cancelled",
  ];
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as BookingStatus)
    : "pending";
}

function buildSlots(date: string): Array<{ start: string; end: string }> {
  return [
    { start: `${date}T04:00:00.000Z`, end: `${date}T05:00:00.000Z` },
    { start: `${date}T05:00:00.000Z`, end: `${date}T06:00:00.000Z` },
  ];
}

export function resetBookingsSource() {
  bookings = [];
  nextBookingId = 100;
  availabilityService = { ...defaultAvailabilityService };
  forceConflict = false;
  forceCancelCutoff = false;
}

export function setBookingConflictError(enabled: boolean) {
  forceConflict = enabled;
}

export function setBookingCancelCutoffError(enabled: boolean) {
  forceCancelCutoff = enabled;
}

export function setAvailabilityService(service: AvailabilityService) {
  availabilityService = { ...service };
}

export const bookingsHandlers = [
  http.get(`${API_URL}/services/:slug/availability`, ({ params, request }) => {
    callCounts.bookingAvailability += 1;
    const slug = String(params.slug);
    if (slug !== availabilityService.slug) {
      return notFound();
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const mode = url.searchParams.get("mode");
    if (!date) {
      return validationError({ date: ["The date field is required."] });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return validationError({ date: ["The date field must match the format Y-m-d."] });
    }
    if (mode !== null && mode !== "nearest") {
      return validationError({ mode: ["The selected mode is invalid."] });
    }

    const slots = buildSlots(date);
    const payload: Record<string, unknown> = {
      service: { ...availabilityService },
      date,
      timezone: "Asia/Karachi",
      slots,
    };
    if (mode === "nearest") {
      payload.nearest_slot = slots[0] ?? null;
    }
    return HttpResponse.json(payload);
  }),

  http.post(`${API_URL}/bookings`, async ({ request }) => {
    callCounts.bookingCreate += 1;
    const denied = guard();
    if (denied) return denied;

    const body = (await request.json()) as Record<string, unknown>;
    const errors: Record<string, string[]> = {};
    if (body.service_id === undefined || body.service_id === null) {
      errors.service_id = ["The service id field is required."];
    }
    if (!body.scheduled_slot_start) {
      errors.scheduled_slot_start = ["The scheduled slot start field is required."];
    }
    if (!body.scheduled_slot_end) {
      errors.scheduled_slot_end = ["The scheduled slot end field is required."];
    }
    if (Object.keys(errors).length > 0) {
      return validationError(errors);
    }
    if (forceConflict) {
      return conflictError();
    }

    const id = nextBookingId++;
    const booking: TestBooking = {
      id,
      user_id: 7,
      service_id: Number(body.service_id),
      address_id: body.address_id === undefined || body.address_id === null ? null : Number(body.address_id),
      technician_id: null,
      scheduled_slot_start: String(body.scheduled_slot_start),
      scheduled_slot_end: String(body.scheduled_slot_end),
      status: "pending",
      problem_description:
        body.problem_description === undefined || body.problem_description === null
          ? null
          : String(body.problem_description),
      final_price: null,
      cancelled_at: null,
      rescheduled_from_id: null,
      created_at: "2026-11-23T10:00:00.000000Z",
      updated_at: "2026-11-23T10:00:00.000000Z",
      service: {
        id: Number(body.service_id),
        slug: availabilityService.slug,
        duration_minutes: availabilityService.duration_minutes,
      },
    };
    bookings.push(booking);
    return HttpResponse.json({ booking: cloneBooking(booking) }, { status: 201 });
  }),

  http.get(`${API_URL}/bookings`, () => {
    callCounts.bookings += 1;
    const denied = guard();
    if (denied) return denied;
    const data = bookings.map(cloneBooking);
    return HttpResponse.json({
      bookings: {
        data,
        total: data.length,
        per_page: 15,
        current_page: 1,
      },
    });
  }),

  http.get(`${API_URL}/bookings/:id`, ({ params }) => {
    callCounts.bookingShow += 1;
    const denied = guard();
    if (denied) return denied;
    const id = Number(params.id);
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return notFound();
    return HttpResponse.json({ booking: cloneBooking(booking) });
  }),

  http.post(`${API_URL}/bookings/:id/cancel`, ({ params }) => {
    callCounts.bookingCancel += 1;
    const denied = guard();
    if (denied) return denied;
    const id = Number(params.id);
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return notFound();
    if (forceCancelCutoff) {
      return cutoffError();
    }
    booking.status = asBookingStatus("cancelled");
    booking.cancelled_at = "2026-11-23T10:05:00.000000Z";
    booking.updated_at = "2026-11-23T10:05:00.000000Z";
    return HttpResponse.json({ booking: cloneBooking(booking) });
  }),
];
