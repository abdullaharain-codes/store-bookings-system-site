import { http, HttpResponse } from "msw";
import type { Booking, BookingStatus } from "@ecommerce/api-client";
import { API_URL, callCounts, session } from "./handlers";

/**
 * Single source of truth for booking MSW handlers (availability, create, list,
 * detail, cancel). Mirrors the real server contract (BK-0c/BK-1, 2026-11-25):
 * - GET  /services/{slug}/availability?date=YYYY-MM-DD[&mode=nearest]
 *        -> 200 { service, date, timezone, slots, nearest_slot? }
 *        slots are business-timezone offset strings (+05:00, Asia/Karachi),
 *        09:00-18:00 with 60 min duration and 15 min buffer (Mon-Sat style).
 * - POST /bookings          -> 201 { booking } (service loaded; create omits
 *        technician_id/final_price/cancelled_at/rescheduled_from_id)
 * - GET  /bookings          -> 200 { bookings: full Laravel paginator }
 * - GET  /bookings/{id}     -> 200 { booking } (service loaded, full shape)
 * - POST /bookings/{id}/cancel -> 200 { booking }
 * - Ownership/unknown booking -> 404 { message: "Not Found" }
 * - Real overlap conflict against stored non-cancelled bookings -> 422 slot unavailable
 * - Cancel already cancelled -> 422 "This booking has already been cancelled."
 * - address_id not owned by user -> 404 { message: "Not Found" }
 * - Cutoff rejection is flag-driven (setBookingCancelCutoffError) because real
 *   cutoff depends on current time vs slot start and business settings; tests
 *   need deterministic control without time mocking.
 */

interface AvailabilityService {
  id: number;
  slug: string;
  duration_minutes: number;
}

interface BookingServiceFull {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price_min: string;
  price_max: string;
  duration_minutes: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

const defaultAvailabilityService: AvailabilityService = {
  id: 1,
  slug: "ac-repair",
  duration_minutes: 60,
};

const defaultBookingService: BookingServiceFull = {
  id: 1,
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

let availabilityService: AvailabilityService = { ...defaultAvailabilityService };
let bookingService: BookingServiceFull = { ...defaultBookingService };

interface StoredBooking extends Booking {
  user_id: number;
}

let bookings: StoredBooking[] = [];
let nextBookingId = 100;
let forceConflict = false;
let forceCancelCutoff = false;
let ownedAddressIds = new Set<number>([1, 4]);

function cloneService(service: BookingServiceFull): BookingServiceFull {
  return { ...service };
}

function toDetailBooking(booking: StoredBooking): Booking {
  return {
    id: booking.id,
    user_id: booking.user_id,
    service_id: booking.service_id,
    technician_id: booking.technician_id ?? null,
    address_id: booking.address_id ?? null,
    scheduled_slot_start: booking.scheduled_slot_start,
    scheduled_slot_end: booking.scheduled_slot_end,
    status: booking.status,
    problem_description: booking.problem_description ?? null,
    final_price: booking.final_price ?? null,
    cancelled_at: booking.cancelled_at ?? null,
    rescheduled_from_id: booking.rescheduled_from_id ?? null,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
    service: booking.service ? (cloneService(booking.service as BookingServiceFull) as Booking["service"]) : undefined,
  };
}

function toCreateBooking(booking: StoredBooking) {
  return {
    id: booking.id,
    user_id: booking.user_id,
    service_id: booking.service_id,
    address_id: booking.address_id ?? null,
    scheduled_slot_start: booking.scheduled_slot_start,
    scheduled_slot_end: booking.scheduled_slot_end,
    status: booking.status,
    problem_description: booking.problem_description ?? null,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
    service: cloneService(booking.service as BookingServiceFull),
  };
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

function alreadyCancelledError(): HttpResponse<{ message: string }> {
  return HttpResponse.json(
    { message: "This booking has already been cancelled." },
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
  // 09:00-18:00 Asia/Karachi (+05:00), 60 min duration, 15 min buffer.
  const starts = ["09:00:00", "10:15:00", "11:30:00", "12:45:00", "14:00:00", "15:15:00", "16:30:00"];
  const ends = ["10:00:00", "11:15:00", "12:30:00", "13:45:00", "15:00:00", "16:15:00", "17:30:00"];
  return starts.map((start, index) => ({
    start: `${date}T${start}+05:00`,
    end: `${date}T${ends[index]}+05:00`,
  }));
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = Date.parse(startA);
  const aEnd = Date.parse(endA);
  const bStart = Date.parse(startB);
  const bEnd = Date.parse(endB);
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && aEnd > bStart;
}

function hasOverlapConflict(serviceId: number, start: string, end: string): boolean {
  return bookings.some(
    (b) =>
      b.service_id === serviceId &&
      b.status !== "cancelled" &&
      overlaps(start, end, b.scheduled_slot_start, b.scheduled_slot_end),
  );
}

export function resetBookingsSource() {
  bookings = [];
  nextBookingId = 100;
  availabilityService = { ...defaultAvailabilityService };
  bookingService = { ...defaultBookingService };
  forceConflict = false;
  forceCancelCutoff = false;
  ownedAddressIds = new Set<number>([1, 4]);
}

export function setBookingConflictError(enabled: boolean) {
  forceConflict = enabled;
}

export function setBookingCancelCutoffError(enabled: boolean) {
  forceCancelCutoff = enabled;
}

export function setAvailabilityService(service: AvailabilityService) {
  availabilityService = { ...service };
  bookingService = {
    ...defaultBookingService,
    id: service.id,
    slug: service.slug,
    duration_minutes: service.duration_minutes,
  };
}

export function setOwnedAddressIds(ids: number[]) {
  ownedAddressIds = new Set<number>(ids);
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

    const addressId = body.address_id === undefined || body.address_id === null ? null : Number(body.address_id);
    if (addressId !== null && !ownedAddressIds.has(addressId)) {
      return notFound();
    }

    const start = String(body.scheduled_slot_start);
    const end = String(body.scheduled_slot_end);
    const serviceId = Number(body.service_id);
    if (forceConflict || hasOverlapConflict(serviceId, start, end)) {
      return conflictError();
    }

    const id = nextBookingId++;
    const booking: StoredBooking = {
      id,
      user_id: 7,
      service_id: serviceId,
      technician_id: null,
      address_id: addressId,
      scheduled_slot_start: start,
      scheduled_slot_end: end,
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
      service: cloneService({
        ...bookingService,
        id: serviceId,
      }) as Booking["service"],
    };
    bookings.push(booking);
    return HttpResponse.json({ booking: toCreateBooking(booking) }, { status: 201 });
  }),

  http.get(`${API_URL}/bookings`, ({ request }) => {
    callCounts.bookings += 1;
    const denied = guard();
    if (denied) return denied;

    const url = new URL(request.url);
    const pageRaw = url.searchParams.get("page");
    const page = pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1;
    const perPage = 15;
    const userBookings = bookings.filter((b) => b.user_id === 7).map(toDetailBooking);
    const total = userBookings.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const startIndex = (page - 1) * perPage;
    const data = userBookings.slice(startIndex, startIndex + perPage);
    const from = data.length > 0 ? startIndex + 1 : null;
    const to = data.length > 0 ? startIndex + data.length : null;
    const base = `${API_URL}/bookings`;
    const pageUrl = (p: number) => `${base}?page=${p}`;

    return HttpResponse.json({
      bookings: {
        current_page: page,
        data,
        first_page_url: pageUrl(1),
        from,
        last_page: lastPage,
        last_page_url: pageUrl(lastPage),
        links: [
          { url: page > 1 ? pageUrl(page - 1) : null, label: "&laquo; Previous", active: false, page: page > 1 ? page - 1 : null },
          { url: pageUrl(page), label: String(page), active: true, page },
          { url: page < lastPage ? pageUrl(page + 1) : null, label: "Next &raquo;", active: false, page: page < lastPage ? page + 1 : null },
        ],
        next_page_url: page < lastPage ? pageUrl(page + 1) : null,
        path: base,
        per_page: perPage,
        prev_page_url: page > 1 ? pageUrl(page - 1) : null,
        to,
        total,
      },
    });
  }),

  http.get(`${API_URL}/bookings/:id`, ({ params }) => {
    callCounts.bookingShow += 1;
    const denied = guard();
    if (denied) return denied;
    const id = Number(params.id);
    const booking = bookings.find((b) => b.id === id && b.user_id === 7);
    if (!booking) return notFound();
    return HttpResponse.json({ booking: toDetailBooking(booking) });
  }),

  http.post(`${API_URL}/bookings/:id/cancel`, ({ params }) => {
    callCounts.bookingCancel += 1;
    const denied = guard();
    if (denied) return denied;
    const id = Number(params.id);
    const booking = bookings.find((b) => b.id === id && b.user_id === 7);
    if (!booking) return notFound();
    if (booking.status === "cancelled") {
      return alreadyCancelledError();
    }
    if (forceCancelCutoff) {
      return cutoffError();
    }
    booking.status = asBookingStatus("cancelled");
    booking.cancelled_at = "2026-11-23T10:05:00.000000Z";
    booking.updated_at = "2026-11-23T10:05:00.000000Z";
    return HttpResponse.json({ booking: toDetailBooking(booking) });
  }),
];
