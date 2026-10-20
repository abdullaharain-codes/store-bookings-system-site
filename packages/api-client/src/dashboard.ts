/**
 * Typed wrapper around the customer dashboard endpoint (Laravel API v1).
 *
 * Response shape mirrors App\Modules\Users\Services\DashboardService::overview
 * exactly — verified against the actual service rather than guessed:
 * - GET /dashboard -> { orders_count, upcoming_bookings, wishlist_count }
 *   (a TOP-LEVEL object; the controller returns the overview array directly,
 *   not wrapped in an envelope key like { dashboard: ... }).
 *
 * Requires auth:sanctum (guest = 401); ownership is the authenticated user
 * itself — there is no {id} parameter, the aggregation always targets the
 * logged-in user (PRD §5.2).
 */
import apiClient from "./api-client";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

/**
 * An upcoming non-terminal booking, soonest first, capped at 3. The service
 * relation is eager-loaded with only its name (with('service:id,name')).
 */
export interface DashboardUpcomingBooking {
  id: number;
  status: string;
  /** ISO-8601 datetime cast of the scheduled slot start. */
  scheduled_slot_start: string;
  /** Null if the service row no longer exists. */
  service: { name: string | null };
}

export interface DashboardSummary {
  orders_count: number;
  upcoming_bookings: DashboardUpcomingBooking[];
  wishlist_count: number;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** The authenticated customer's account overview (PRD §5.2). */
export async function getDashboard(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>("/dashboard");
  return data;
}