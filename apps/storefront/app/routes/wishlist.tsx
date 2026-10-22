import { WishlistView } from "../components/wishlist/WishlistView";

/**
 * /wishlist — one line into the wishlist page (TASK B4-2b). No loader here: the
 * wishlist is per-user and CSR-only (excluded from prerender), and the view
 * owns its query and title, so the route stays a thin wrapper behind the
 * require-auth guard.
 */
export default function WishlistRoute() {
  return <WishlistView />;
}
