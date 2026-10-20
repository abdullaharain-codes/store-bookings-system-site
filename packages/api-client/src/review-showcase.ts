/**
 * Typed wrapper around the public review-showcase read endpoint (Laravel API
 * v1).
 *
 * Response shape mirrors App\Http\Controllers\Api\V1\ReviewShowcaseController
 * exactly — verified against the controller and PublicReviewShowcaseApiTest
 * rather than guessed:
 * - GET /review-showcase -> { review_showcase_items: <Laravel paginator> }
 *
 * The envelope is NOT bare: `ReviewShowcaseController::index` wraps the
 * paginator in a `review_showcase_items` key, so the same "wrapped" convention
 * as /categories and /brands applies here, and unlike /products and /services
 * the paginator is nested one level down.
 */
import apiClient from "./api-client";
import type { Asset, Paginator } from "./catalog";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

export interface ReviewShowcaseItem {
  id: number;
  asset_id: number;
  /** Nullable column — a screenshot can be published with no caption. */
  caption: string | null;
  /** Admin-defined display order (the repository orders by this, then id). */
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  /**
   * The screenshot itself. The FK is RESTRICT + required, so unlike
   * `Category.logo_asset` this is never null. Per SRS §3.4 the SCREENSHOT is
   * the content — an item is deliberately not joined to the reviews table, so
   * there is no rating, author name or review text on this payload.
   */
  asset: Asset;
}

// ─── Envelope types ──────────────────────────────────────────────────────────

export interface ReviewShowcaseResponse {
  review_showcase_items: Paginator<ReviewShowcaseItem>;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/**
 * The storefront review-showcase gallery: published items in admin-defined
 * display order, paginated (default 15 per page server-side), no auth.
 *
 * `page` is only sent when provided, so an omitted page lets the backend apply
 * its own default rather than pinning page 1 in the URL.
 */
export async function getReviewShowcase(
  page?: number,
): Promise<ReviewShowcaseResponse> {
  const { data } = await apiClient.get<ReviewShowcaseResponse>("/review-showcase", {
    params: page !== undefined ? { page } : undefined,
  });
  return data;
}
