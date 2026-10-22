import { useParams } from "react-router";
import { OrderDetailView } from "../components/orders/OrderDetailView";

/**
 * /account/orders/:id (TASK B4-2a) — one line into the order detail view. Like
 * /cart it is per-user and CSR-only (excluded from prerender), and the view owns
 * its query, title and single h1, so the route stays a thin wrapper behind the
 * require-auth guard and the account layout's <Outlet/>.
 */
export default function OrderDetailRoute() {
  const { id } = useParams();
  return <OrderDetailView orderId={Number(id)} />;
}
