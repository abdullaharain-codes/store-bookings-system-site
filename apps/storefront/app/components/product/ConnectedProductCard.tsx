import { useEffect } from "react";
import type { ComponentProps } from "react";
import { ProductCard } from "@ecommerce/ui";
import { useAddToCart } from "../../hooks/useAddToCart";
import { useAnnounce } from "../common/Announcer";

/**
 * The catalogue's live add-to-cart card (TASK B4-1a, updated B4-1c). The
 * presentation-only ui ProductCard stays untouched; this wrapper supplies the
 * one connected callback (onAddToCart) so every catalogue surface shares the
 * same session deferral + mutation behaviour. Wishlist wiring is intentionally
 * left unset — it is a separate task.
 *
 * The success/error message is announced through the site's single polite live
 * region (components/common/Announcer) rather than a per-card sr-only status,
 * so every surface speaks through one announcer.
 */
export function ConnectedProductCard(
  props: Omit<ComponentProps<typeof ProductCard>, "onAddToCart" | "onWishlistToggle">
) {
  const { addToCart, message } = useAddToCart();
  const announce = useAnnounce();

  useEffect(() => {
    if (message) announce(message);
  }, [message, announce]);

  return (
    <ProductCard
      {...props}
      onAddToCart={(productId) => addToCart(productId)}
    />
  );
}
