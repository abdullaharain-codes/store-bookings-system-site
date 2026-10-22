import { http, HttpResponse } from "msw";
import type { WishlistItem } from "@ecommerce/api-client";
import {
  API_URL,
  callCounts,
  getProductDetailPool,
  session,
  testUser,
} from "./handlers";

/**
 * MSW handlers for the wishlist slice (TASK B4-2b), kept in their own module so
 * the shared handlers.ts / handlers-checkout.ts stay focused. This file imports
 * state and accessors FROM ./handlers — the dependency runs one way only, so
 * registering it in server.ts introduces no import cycle.
 *
 * Every shape here was read off the real server, not guessed:
 * - GET  /wishlist           -> { wishlist: WishlistItem[] } — a PLAIN array,
 *                               NOT a paginator (WishlistService::list()).
 * - POST /wishlist/{product}  -> { is_wishlisted: boolean }, 200 for BOTH add
 *                               and remove (WishlistService::toggle()).
 * - Both routes sit behind auth:sanctum, so a guest gets a 401
 *   (WishlistApiTest "guest gets 401 on every wishlist endpoint").
 * - An unknown product id 404s via route-model binding.
 */

export const WISHLIST_URL = `${API_URL}/wishlist`;

/** The user the in-memory wishlist belongs to (the signed-in test user). */
let wishlistSource: WishlistItem[] = [];
let wishlistSequence = 0;

export function setWishlistSource(items: WishlistItem[]): void {
  wishlistSource = items;
  wishlistSequence = Math.max(0, ...items.map((item) => item.id));
}

export function getWishlistSource(): WishlistItem[] {
  return wishlistSource;
}

/**
 * A forced failure for the NEXT wishlist request, so a test can drive the page
 * error branch. `null` behaves normally. Cleared after every test in setup.ts.
 */
let wishlistError: { status: number; message: string } | null = null;

export function setWishlistError(
  error: { status: number; message: string } | null
): void {
  wishlistError = error;
}

const unauthenticated = () =>
  HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });

/** Build a wishlist row from a product in the shared detail pool. */
function wishlistRowFor(productId: number): WishlistItem | null {
  const product = getProductDetailPool().find((item) => item.id === productId);
  if (!product) return null;
  wishlistSequence += 1;
  return {
    id: wishlistSequence,
    user_id: testUser.id,
    product_id: product.id,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
    product,
  };
}

export const wishlistHandlers = [
  http.get(WISHLIST_URL, () => {
    callCounts.wishlist += 1;
    if (!session.active) return unauthenticated();
    if (wishlistError) {
      return HttpResponse.json(
        { message: wishlistError.message },
        { status: wishlistError.status }
      );
    }
    return HttpResponse.json({ wishlist: wishlistSource });
  }),

  http.post(`${WISHLIST_URL}/:product`, ({ params }) => {
    callCounts.wishlistToggle += 1;
    if (!session.active) return unauthenticated();

    const productId = Number(params.product);
    const existing = wishlistSource.find((item) => item.product_id === productId);

    if (existing) {
      wishlistSource = wishlistSource.filter(
        (item) => item.product_id !== productId
      );
      return HttpResponse.json({ is_wishlisted: false });
    }

    const row = wishlistRowFor(productId);
    if (!row) {
      return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    }
    wishlistSource = [...wishlistSource, row];
    return HttpResponse.json({ is_wishlisted: true });
  }),
];
