import { useParams } from "react-router";
import { ProductDetail } from "../components/product/ProductDetail";
import { useAddToCart } from "../hooks/useAddToCart";

/**
 * /product/:slug (TASK B3-2) — one line into the data-driven detail page.
 * Deliberately loader/meta/fallback-free: the component owns its queries and
 * React 19 hoists the title/meta it renders, so the prerender set is unchanged.
 *
 * TASK B4-1a: the route stays the ONLY place that connects the presentational
 * ProductDetail to the session-aware add-to-cart hook.
 *
 * TASK B4-1b: the hook message is handed to ProductDetail, which owns the
 * always-mounted "Purchase options" live region — the route renders no notice.
 */
export default function ProductRoute() {
  const { slug } = useParams();
  const { addToCart, message } = useAddToCart();

  return (
    <ProductDetail
      slug={slug ?? ""}
      onAddToCart={(productId, quantity) => addToCart(productId, quantity)}
      statusMessage={message}
    />
  );
}