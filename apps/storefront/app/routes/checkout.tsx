import { CheckoutView } from "../components/checkout/CheckoutView";

/**
 * /checkout (TASK B4-2a). One line into the real checkout view: like /cart it
 * is per-user and CSR-only (excluded from prerender), and the view owns its
 * queries, title and single h1, so the route stays a thin wrapper behind the
 * require-auth guard.
 */
export default function CheckoutRoute() {
  return <CheckoutView />;
}
