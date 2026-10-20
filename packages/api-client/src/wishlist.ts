/**
 * Typed wrappers around the authenticated wishlist endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\WishlistController
 * exactly — verified against the controller rather than guessed:
 * - GET  /wishlist            -> { wishlist: WishlistItem[] } — a PLAIN
 *                                array, NOT a Laravel paginator envelope
 *                                (WishlistService::list() returns ->get()).
 * - POST /wishlist/{product}  -> { is_wishlisted: boolean }
 *
 * Both routes sit behind auth:sanctum (routes/api.php); guests get a 401.
 * No special 401 handling here — callers own the response, same convention
 * as cart.ts / order.ts.
 */
import apiClient from "./api-client";
import type { Product } from "./catalog";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

/**
 * A serialized Wishlist model (raw Eloquent output, no transformer) plus the
 * eager-loaded relation. The nested `product` carries the same fully
 * eager-loaded shape as ProductController (brand, categories, images.asset)
 * — see WishlistService::list().
 */
export interface WishlistItem {
  id: number;
  user_id: number;
  product_id: number;
  created_at?: string;
  updated_at?: string;
  product: Product;
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface WishlistResponse {
  wishlist: WishlistItem[];
}

export interface WishlistToggleResponse {
  is_wishlisted: boolean;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** The authenticated user's wishlist as a plain, unpaginated array. */
export async function getWishlist(): Promise<WishlistResponse> {
  const { data } = await apiClient.get<WishlistResponse>("/wishlist");
  return data;
}

/**
 * Toggle a product in the wishlist (add if absent, remove if present).
 * Returns the resulting state so the caller can flip a heart without a
 * second round-trip. The {product} route segment is route-model-bound, so
 * unknown ids 404 server-side.
 */
export async function toggleWishlist(
  productId: number,
): Promise<WishlistToggleResponse> {
  const { data } = await apiClient.post<WishlistToggleResponse>(
    `/wishlist/${productId}`,
  );
  return data;
}