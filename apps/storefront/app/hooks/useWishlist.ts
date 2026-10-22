import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  getWishlist,
  isSafeInternalPath,
  toggleWishlist,
  useAuthStore,
  type WishlistItem,
} from "@ecommerce/api-client";
import { getApiErrorStatus, userMessageFor } from "../lib/api-error";
import { useAnnounce } from "../components/common/Announcer";
import { queryKeys } from "./query-keys";

/** Wishlist announcements (kept in a non-component module for Fast Refresh). */
export const WISHLIST_ADDED_ANNOUNCEMENT = "Added to wishlist.";
export const WISHLIST_REMOVED_ANNOUNCEMENT = "Removed from wishlist.";
export const WISHLIST_GENERIC_ERROR_MESSAGE =
  "We couldn't update your wishlist. Please try again.";

/**
 * The wishlist is per-user and its contents change rarely mid-session, so a
 * short stale window avoids a refetch on every navigation while a toggle still
 * forces a fresh read through invalidateQueries.
 */
const WISHLIST_STALE_TIME = 60 * 1000;

export interface UseWishlistResult {
  productIds: Set<number>;
  items: WishlistItem[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The signed-in user's wishlist, read through the shared `queryKeys.wishlist`
 * entry (so the page and any heart on the same screen never issue two
 * requests). Guests get an empty Set and make NO request — the query stays
 * disabled until the session is checked and authenticated.
 */
export function useWishlist(): UseWishlistResult {
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const wishlistQuery = useQuery({
    queryKey: queryKeys.wishlist,
    queryFn: getWishlist,
    enabled: isSessionChecked && isAuthenticated,
    staleTime: WISHLIST_STALE_TIME,
  });

  const items = wishlistQuery.data?.wishlist ?? [];
  const productIds = new Set(items.map((item) => item.product_id));

  return {
    productIds,
    items,
    isPending: wishlistQuery.isPending,
    isError: wishlistQuery.isError,
    refetch: () => {
      void wishlistQuery.refetch();
    },
  };
}

export interface UseToggleWishlistResult {
  toggle: (productId: number) => void;
  isPending: (productId?: number) => boolean;
  status: "idle" | "guest" | "pending" | "success" | "error";
}

/**
 * Toggle a product in/out of the wishlist (TASK B4-2b).
 *
 * Two audiences (owner decision D1):
 *  - A GUEST makes NO API call. The heart navigates to /login carrying the
 *    current pathname+search as `state.from` (the same mechanism RequireAuth
 *    uses), returns to the SAME page after sign-in, and NOTHING is deferred:
 *    the API is a toggle, so replaying it could REMOVE an item the account
 *    already had. Nothing is written to the pending-action store.
 *  - A signed-in user toggles directly. On success ONLY `queryKeys.wishlist`
 *    is invalidated; the announcement is decided from the SERVER's
 *    `is_wishlisted` reply (added vs removed), never guessed client-side.
 *    A 401 mid-flight behaves like a guest; 409/422 shows the server's own
 *    message; anything else collapses to a generic line via `userMessageFor`.
 *
 * A synchronous per-product ref guard means a double click sends ONE request.
 */
export function useToggleWishlist() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [status, setStatus] = useState<UseToggleWishlistResult["status"]>(
    "idle"
  );
  // Synchronous guard: React Query's isPending only flips on the next render,
  // so a rapid double click would otherwise fire two requests.
  const inFlightRef = useRef<Set<number>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  // The product the mutation last tried, so a 401 can re-behave as a guest.
  const lastProductRef = useRef<number | null>(null);

  const redirectGuest = useCallback(
    (productId: number) => {
      lastProductRef.current = productId;
      const target = location.pathname + location.search;
      if (isSafeInternalPath(target)) {
        navigate("/login", { state: { from: target } });
      } else {
        navigate("/login");
      }
    },
    [location.pathname, location.search, navigate]
  );

  const mutation = useMutation({
    mutationFn: (productId: number) => toggleWishlist(productId),
    onSuccess: (data) => {
      const productId = lastProductRef.current;
      if (productId !== null) {
        inFlightRef.current.delete(productId);
        setPendingIds(new Set(inFlightRef.current));
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist });
      setStatus("success");
      announce(
        data.is_wishlisted
          ? WISHLIST_ADDED_ANNOUNCEMENT
          : WISHLIST_REMOVED_ANNOUNCEMENT
      );
    },
    onError: (error) => {
      const productId = lastProductRef.current;
      if (productId !== null) {
        inFlightRef.current.delete(productId);
        setPendingIds(new Set(inFlightRef.current));
      }

      if (getApiErrorStatus(error) === 401) {
        setStatus("guest");
        if (productId !== null) redirectGuest(productId);
        return;
      }

      setStatus("error");
      announce(userMessageFor(error, WISHLIST_GENERIC_ERROR_MESSAGE));
    },
  });

  const toggle = useCallback(
    (productId: number) => {
      if (inFlightRef.current.has(productId)) return;

      if (isSessionChecked && !isAuthenticated) {
        setStatus("guest");
        redirectGuest(productId);
        return;
      }

      lastProductRef.current = productId;
      inFlightRef.current.add(productId);
      setPendingIds(new Set(inFlightRef.current));
      setStatus("pending");
      mutation.mutate(productId);
    },
    [mutation, isSessionChecked, isAuthenticated, redirectGuest]
  );

  const isPending = useCallback(
    (productId?: number) =>
      productId === undefined
        ? pendingIds.size > 0
        : pendingIds.has(productId),
    [pendingIds]
  );

  return { toggle, isPending, status };
}
