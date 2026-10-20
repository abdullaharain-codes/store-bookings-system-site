/**
 * Typed wrappers around the product/service review endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\ReviewController exactly —
 * verified against the controller rather than guessed:
 * - GET /products/{slug}/reviews  -> { reviews: Paginator<ReviewItem> }
 * - GET /services/{slug}/reviews  -> { reviews: Paginator<ReviewItem> }
 * - POST /reviews                 -> { review: Review } (201)
 *
 * Public reads are published-only and keyed by the parent's SLUG (a missing or
 * unpublished target is an identical 404). Submission is authenticated
 * (auth:sanctum + throttle:review-submission); eligibility — a DELIVERED
 * order for a product, a COMPLETED booking for a service — is enforced
 * entirely in ReviewService, never on the client (rules.md §9). One review
 * per customer per target. Reviews are created live; publish state is
 * admin-owned afterward (PRD §12/19).
 */
import apiClient from "./api-client";
import type { Paginator } from "./catalog";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

/**
 * A review row on the public paginated read paths. The repository selects
 * only id/user_id/{target}/rating/comment/verified_source/created_at and
 * eager-loads the author as user:id,name — is_published, source_id and
 * updated_at are deliberately NOT exposed publicly.
 */
export interface ReviewItem {
  id: number;
  user_id: number;
  /** Exactly one of the two targets is present per review (server-side XOR). */
  product_id?: number;
  service_id?: number;
  rating: number;
  comment: string | null;
  /** Which purchase fact granted the write — 'order' or 'service_booking'. */
  verified_source: "order" | "service_booking";
  created_at: string;
  /** Author, exposed as id + name only (with('user:id,name')). */
  user: { id: number; name: string };
}

/**
 * Full serialized Review model — the POST /reviews response. Includes the
 * traceability pair (verified_source + source_id) and is_published that the
 * public reads omit.
 */
export interface Review {
  id: number;
  user_id: number;
  product_id: number | null;
  service_id: number | null;
  rating: number;
  comment: string | null;
  verified_source: "order" | "service_booking";
  source_id: number | null;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export type ReviewsResponse = Paginator<ReviewItem>;

/** POST /reviews payload. The "exactly one target" XOR is server-enforced. */
export interface SubmitReviewData {
  rating: number;
  comment?: string | null;
  product_id?: number;
  service_id?: number;
}

export interface SubmitReviewResponse {
  review: Review;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** Published reviews of a published product, paginated. */
export async function getProductReviews(
  productSlug: string,
  page?: number,
  perPage?: number,
): Promise<{ reviews: ReviewsResponse }> {
  const { data } = await apiClient.get<{ reviews: ReviewsResponse }>(
    `/products/${productSlug}/reviews`,
    {
      params:
        page !== undefined || perPage !== undefined
          ? { page, per_page: perPage }
          : undefined,
    },
  );
  return data;
}

/** Published reviews of a published service, paginated. */
export async function getServiceReviews(
  serviceSlug: string,
  page?: number,
  perPage?: number,
): Promise<{ reviews: ReviewsResponse }> {
  const { data } = await apiClient.get<{ reviews: ReviewsResponse }>(
    `/services/${serviceSlug}/reviews`,
    {
      params:
        page !== undefined || perPage !== undefined
          ? { page, per_page: perPage }
          : undefined,
    },
  );
  return data;
}

/**
 * Submit a review of a product or service (exactly one of product_id /
 * service_id). Eligibility, duplicate checks and the target XOR are all
 * enforced server-side; the review is created live and an admin retains
 * publish/unpublish power over it.
 */
export async function submitReview(
  data: SubmitReviewData,
): Promise<SubmitReviewResponse> {
  const { data: response } = await apiClient.post<SubmitReviewResponse>(
    "/reviews",
    data,
  );
  return response;
}