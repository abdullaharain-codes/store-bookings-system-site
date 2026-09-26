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
import type { Paginator } from "./catalog";

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

/** Published services, paginated. */
export async function getServices(page?: number): Promise<ServicesResponse> {
  const { data } = await apiClient.get<ServicesResponse>("/services", {
    params: page !== undefined ? { page } : undefined,
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