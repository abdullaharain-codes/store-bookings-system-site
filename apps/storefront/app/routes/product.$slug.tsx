import { useParams } from "react-router";
import { ProductDetail } from "../components/product/ProductDetail";
import { useAddToCart } from "../hooks/useAddToCart";
import { useToggleWishlist, useWishlist } from "../hooks/useWishlist";

/**
 * /product/:slug (TASK B3-2, wired for wishlist + Buy Now in B4-2b).
 * Deliberately loader/meta/fallback-free: the component owns its queries and
 * React 19 hoists the title/meta it renders, so the prerender set is unchanged.
 *
 * The route stays the ONLY place that connects the presentational ProductDetail
 * to the session-aware hooks (add-to-cart, wishlist). Buy Now reuses the SAME
 * add-to-cart hook with `redirectAfter="/checkout"` (never forking it): the line
 * is added, then the shopper lands on checkout — which still needs its explicit
 * confirm click, so nothing is auto-submitted.
 *
 * The wishlist Set is handed down rather than a boolean, because the view owns
 * the product fetch and only IT knows the loaded product's id (the route only
 * has the slug). The unwishlisted state is still correct: the Set simply does
 * not contain the id.
 */
export default function ProductRoute() {
  const { slug } = useParams();
  const { addToCart, message } = useAddToCart();
  const wishlist = useWishlist();
  const { toggle } = useToggleWishlist();

  return (
    <ProductDetail
      slug={slug ?? ""}
      onAddToCart={(id, quantity) => addToCart(id, quantity)}
      onBuyNow={(id, quantity) => addToCart(id, quantity, "/checkout")}
      onWishlistToggle={(id) => toggle(id)}
      wishlistProductIds={wishlist.productIds}
      statusMessage={message}
    />
  );
}
