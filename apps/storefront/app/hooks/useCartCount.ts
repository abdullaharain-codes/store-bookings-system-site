import { getCart, useAuthStore } from "@ecommerce/api-client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

/**
 * Number of distinct line items in the signed-in user's cart, for the header
 * badge. `CartController` returns no count field, so it is derived from
 * `items.length` (lines, not units).
 *
 * The request is gated on a *settled* session: firing it for a guest would 401
 * on every page load, and firing it before the session lookup settles would race
 * the 401 that follows a fresh page load.
 *
 * TASK B4-1c: the query fetches the FULL cart (the same `queryKeys.cart` entry
 * the /cart page reads) and derives the count here. The badge and the page
 * therefore share one cache entry and one request, instead of two query
 * functions competing for the same key with different return shapes.
 */
export function useCartCount() {
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const query = useQuery({
    queryKey: queryKeys.cart,
    queryFn: getCart,
    enabled: isSessionChecked && isAuthenticated,
    staleTime: 0,
  });

  return {
    count: query.data ? query.data.cart.items.length : null,
    isPending: isSessionChecked && isAuthenticated && query.isPending,
  };
}
