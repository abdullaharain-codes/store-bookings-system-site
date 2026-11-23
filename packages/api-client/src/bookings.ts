/**
 * Typed wrappers around the customer booking and service availability endpoints
 * (Laravel API v1).
 *
 * Server contract (STEP 0, BK-0, 2026-11-23):
 * - POST   /bookings                    -> 201 { booking } (loads service)
 * - GET    /bookings                    -> 200 { bookings: paginator } (no service eager load)
 * - GET    /bookings/{id}               -> 200 { booking } (loads service)
 * - POST   /bookings/{id}/cancel        -> 200 { booking }
 * - GET    /services/{slug}/availability?date=YYYY-MM-DD[&mode=nearest]
 *                                       -> 200 { service, date, timezone, slots, nearest_slot? }
 *
 * Availability lives here (not services.ts) because BK-0 allowed files include
 * bookings.ts but not services.ts; it is exported from the package index.
 *
 * No customer reschedule endpoint exists in server/routes/api.php. No
 * attachments in StoreBookingRequest.
 */
import apiClient from "./api-client";

// --- Entity types -----------------------------------------------------------

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "technician_on_the_way"
  | "completed"
  | "cancelled";

export interface BookingServiceSummary {
  id: number;
  name?: string;
  slug?: string;
  duration_minutes?: number;
  price_min?: string;
  price_max?: string;
  [key: string]: unknown;
}

export interface Booking {
  id: number;
  user_id: number;
  service_id: number;
  address_id: number | null;
  technician_id: number | null;
  scheduled_slot_start: string;
  scheduled_slot_end: string;
  status: BookingStatus;
  problem_description: string | null;
  final_price: string | null;
  cancelled_at: string | null;
  rescheduled_from_id: number | null;
  created_at?: string;
  updated_at?: string;
  service?: BookingServiceSummary;
  [key: string]: unknown;
}

// --- Availability types -----------------------------------------------------

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface ServiceAvailabilityService {
  id: number;
  slug: string;
  duration_minutes: number;
}

export interface ServiceAvailabilityResponse {
  service: ServiceAvailabilityService;
  date: string;
  timezone: string;
  slots: AvailabilitySlot[];
  nearest_slot?: AvailabilitySlot | null;
}

// --- Request / response types -----------------------------------------------

export interface CreateBookingData {
  service_id: number;
  scheduled_slot_start: string;
  scheduled_slot_end: string;
  address_id?: number | null;
  problem_description?: string | null;
}

export interface BookingResponse {
  booking: Booking;
}

export interface BookingsPaginator {
  data: Booking[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
  [key: string]: unknown;
}

export interface BookingsResponse {
  bookings: BookingsPaginator;
}

// --- Endpoint wrappers ------------------------------------------------------

export async function getServiceAvailability(
  slug: string,
  date: string,
  mode?: "nearest",
): Promise<ServiceAvailabilityResponse> {
  const params: { date: string; mode?: "nearest" } = { date };
  if (mode !== undefined) {
    params.mode = mode;
  }
  const { data } = await apiClient.get<ServiceAvailabilityResponse>(
    `/services/${slug}/availability`,
    { params },
  );
  return data;
}

export async function createBooking(
  payload: CreateBookingData,
): Promise<BookingResponse> {
  const { data } = await apiClient.post<BookingResponse>("/bookings", payload);
  return data;
}

export async function getBookings(page?: number): Promise<BookingsResponse> {
  const params = page !== undefined ? { page } : undefined;
  const { data } = await apiClient.get<BookingsResponse>("/bookings", { params });
  return data;
}

export async function getBooking(id: number): Promise<BookingResponse> {
  const { data } = await apiClient.get<BookingResponse>(`/bookings/${id}`);
  return data;
}

export async function cancelBooking(id: number): Promise<BookingResponse> {
  const { data } = await apiClient.post<BookingResponse>(`/bookings/${id}/cancel`);
  return data;
}
