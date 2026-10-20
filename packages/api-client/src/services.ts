/**
 * Typed wrappers around the public services read endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\ServiceController
 * exactly — verified against the controller rather than guessed:
 * - GET /services        -> Laravel paginator envelope at the TOP level
 *                           ({ data, links, current_page, total, per_page, ... })
 * - GET /services/{slug} -> { service: Service }
 */
import apiClient from "./api-client";
import { clampPerPage, type Paginator } from "./catalog";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

export interface Service {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /**
   * NOTE: decimal:2 casts on the backend serialize money as STRINGS
   * ("1234.56") to avoid floating-point precision loss. Parse before math.
   */
  price_min: string;
  price_max: string;
  /** Duration in minutes — from the unsignedInteger `duration_minutes` column. */
  duration_minutes: number;
  is_published: boolean;
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export type ServicesResponse = Paginator<Service>;

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/**
 * Published services, paginated. `perPage` is clamped to [1, 48] — the server
 * enforces the same cap (App\Support\PerPage::MAX) — so the /services listing
 * can request a grid-sized page instead of the server default 15.
 */
export async function getServices(
  page?: number,
  perPage?: number,
): Promise<ServicesResponse> {
  const params: Record<string, number> = {};
  if (page !== undefined) params.page = page;
  if (perPage !== undefined) params.per_page = clampPerPage(perPage, "getServices");
  const { data } = await apiClient.get<ServicesResponse>("/services", {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return data;
}

/**
 * Published service detail by slug. Missing AND unpublished slugs both return
 * the identical 404 — an unpublished service must be unreachable via the
 * public API without leaking that it exists (architecture.md §10).
 */
export async function getServiceBySlug(slug: string): Promise<Service> {
  const { data } = await apiClient.get<{ service: Service }>(`/services/${slug}`);
  return data.service;
}