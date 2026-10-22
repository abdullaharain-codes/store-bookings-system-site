import { useEffect } from "react";
import type { ComponentProps } from "react";
import { useAuthStore } from "@ecommerce/api-client";
import { ProductCard } from "@ecommerce/ui";
import { useAddToCart } from "../../hooks/useAddToCart";
import { useToggleWishlist, useWishlist } from "../../hooks/useWishlist";
import { useAnnounce } from "../common/Announcer";

/**
 * The catalogue's live card (TASK B4-1a, updated B4-1c and B4-2b). The
 * presentation-only ui ProductCard stays untouched; this wrapper supplies the
 * connected callbacks: add-to-cart and the wishlist heart.
 *
 * The wishlist read shares the ONE `queryKeys.wishlist` cache entry, so every
 * card on a grid (and the /wishlist page) issues at most one request between
 * them. A guest heart makes no request — useToggleWishlist redirects to /login
 * carrying the current path (owner decision D1, toggle-only, no replay).
 *
 * The success/error message is announced through the site's single polite live
 * region (components/common/Announcer) rather than a per-card sr-only status.
 */
export function ConnectedProductCard(
  props: Omit<
    ComponentProps<typeof ProductCard>,
    "onAddToCart" | "onWishlistToggle" | "isWishlisted" | "isAuthenticated"
  >
) {
  const { addToCart, message } = useAddToCart();
  const wishlist = useWishlist();
  const { toggle } = useToggleWishlist();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const announce = useAnnounce();

  useEffect(() => {
    if (message) announce(message);
  }, [message, announce]);

  return (
    <ProductCard
      {...props}
      isAuthenticated={isAuthenticated}
      isWishlisted={wishlist.productIds.has(props.product.id)}
      onAddToCart={(productId) => addToCart(productId)}
      onWishlistToggle={(productId) => toggle(productId)}
    />
  );
}
