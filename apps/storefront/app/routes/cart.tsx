import { CartView } from "../components/cart/CartView";

/**
 * /cart — one line into the cart page (TASK B4-1c). No loader here: the cart is
 * per-user and CSR-only (excluded from prerender), and the view owns its query
 * and title, so the route stays a thin wrapper behind the require-auth guard.
 */
export default function CartRoute() {
  return <CartView />;
}
