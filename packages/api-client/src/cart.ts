/**
 * Typed wrappers around the cart endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\CartController exactly:
 * - GET    /cart              -> { cart: Cart }
 * - POST   /cart/items        -> { cart_item: CartItem }        (201)
 * - PATCH  /cart/items/{id}   -> { cart_item: CartItem, message }
 * - DELETE /cart/items/{id}   -> { message }
 */
import apiClient from "./api-client";
import type { Product } from "./catalog";

// ─── Entity types ───────────────────────────────────────────────────────────

export interface CartItem {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
  hold_expires_at: string | null;
  /** Appended computed attribute: "none" | "active" | "expired" */
  hold_status: "none" | "active" | "expired";
  created_at?: string;
  updated_at?: string;
  product?: Product;
}

export interface Cart {
  id: number;
  user_id: number;
  items: CartItem[];
  created_at?: string;
  updated_at?: string;
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface CartResponse {
  cart: Cart;
}

export interface CartItemResponse {
  cart_item: CartItem;
}

export interface CartItemMessageResponse {
  cart_item: CartItem;
  message: string;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** Get the authenticated user's cart with items + products. */
export async function getCart(): Promise<CartResponse> {
  const { data } = await apiClient.get<CartResponse>("/cart");
  return data;
}

/** Add a product to the cart (or increase quantity if already present). */
export async function addCartItem(
  productId: number,
  quantity: number,
): Promise<CartItemResponse> {
  const { data } = await apiClient.post<CartItemResponse>("/cart/items", {
    product_id: productId,
    quantity,
  });
  return data;
}

/** Update a cart item's quantity. Pass 0 to remove. */
export async function updateCartItem(
  cartItemId: number,
  quantity: number,
): Promise<CartItemMessageResponse> {
  const { data } = await apiClient.patch<CartItemMessageResponse>(
    `/cart/items/${cartItemId}`,
    { quantity },
  );
  return data;
}

/** Remove a cart item permanently. */
export async function removeCartItem(
  cartItemId: number,
): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(
    `/cart/items/${cartItemId}`,
  );
  return data;
}
