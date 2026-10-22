import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  addCartItem,
  buildAddCartItemRequest,
  isSafeInternalPath,
  useAuthStore,
  useRedirectAndResume,
} from "@ecommerce/api-client";
import { getApiErrorStatus, userMessageFor } from "../lib/api-error";
import { queryKeys } from "./query-keys";

export const ADD_TO_CART_SUCCESS_MESSAGE = "Added to cart.";
export const ADD_TO_CART_GENERIC_ERROR_MESSAGE =
  "We couldn't add this to your cart. Please try again.";

export type AddToCartStatus =
  | "idle"
  | "guest"
  | "pending"
  | "success"
  | "error";

/**
 * Add-to-cart, connected to the session layer (TASK B4-1a).
 *
 * Two audiences:
 *  - A signed-in user posts to /cart/items directly and the single mutation
 *    invalidates the header's cart cache, so the badge refetches.
 *  - A guest defers the exact request through requireAuth; the pending-action
 *    store replays it once the user signs in. No cart request is ever made for
 *    a guest, and a session that dies mid-flight (401) re-defers the same way.
 *
 * Server messages (stock shortages from CartService) surface verbatim on
 * 409/422; anything else collapses to a generic line so a raw stack trace is
 * never shown to a shopper.
 */
export function useAddToCart() {
  const { requireAuth } = useRedirectAndResume();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [status, setStatus] = useState<AddToCartStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // The request the mutation last tried, so a 401 can re-defer it verbatim.
  const lastRequestRef = useRef<{
    productId: number;
    quantity: number;
    targetRoute: string;
  } | null>(null);
  // Buy Now: the internal path to land on after the add succeeds. Only a
  // same-origin relative path is honoured (validated in addToCart).
  const redirectAfterRef = useRef<string | null>(null);

  const deferToTheLogin = useCallback(
    (productId: number, quantity: number, targetRoute: string) => {
      requireAuth({
        ...buildAddCartItemRequest(productId, quantity),
        targetRoute,
      });
    },
    [requireAuth]
  );

  const mutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: number; quantity: number }) =>
      addCartItem(productId, quantity),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      setStatus("success");
      setMessage(ADD_TO_CART_SUCCESS_MESSAGE);

      // Buy Now: after the line is added, move the shopper to checkout. No
      // order is ever submitted here — checkout still needs its explicit click.
      const redirectAfter = redirectAfterRef.current;
      redirectAfterRef.current = null;
      if (redirectAfter) navigate(redirectAfter);
    },
    onError: (error) => {
      redirectAfterRef.current = null;
      if (getApiErrorStatus(error) === 401) {
        const last = lastRequestRef.current;
        if (last) {
          // A Buy Now deferral re-targets checkout; a plain add returns here.
          deferToTheLogin(
            last.productId,
            last.quantity,
            last.targetRoute
          );
        }
        setStatus("guest");
        setMessage(null);
        return;
      }

      setStatus("error");
      setMessage(userMessageFor(error, ADD_TO_CART_GENERIC_ERROR_MESSAGE));
    },
  });

  const addToCart = useCallback(
    (
      productId: number,
      quantity: number = 1,
      redirectAfter?: string
    ) => {
      if (!Number.isInteger(quantity) || quantity < 1 || mutation.isPending) {
        if (!Number.isInteger(quantity) || quantity < 1) {
          setStatus("error");
          setMessage(ADD_TO_CART_GENERIC_ERROR_MESSAGE);
        }
        return;
      }

      // Only a safe internal path is honoured; anything else is dropped so a
      // crafted value cannot become an open redirect.
      const safeRedirect =
        redirectAfter && isSafeInternalPath(redirectAfter)
          ? redirectAfter
          : null;
      redirectAfterRef.current = safeRedirect;

      const targetRoute =
        safeRedirect ?? location.pathname + location.search;
      lastRequestRef.current = { productId, quantity, targetRoute };

      if (isSessionChecked && !isAuthenticated) {
        setStatus("guest");
        setMessage(null);
        // Guest Buy Now lands on /checkout after the replay; a plain add
        // returns to the page it was clicked from.
        deferToTheLogin(productId, quantity, targetRoute);
        return;
      }

      setStatus("pending");
      setMessage(null);
      mutation.mutate({ productId, quantity });
    },
    [
      mutation,
      isSessionChecked,
      isAuthenticated,
      deferToTheLogin,
      location.pathname,
      location.search,
    ]
  );

  return {
    addToCart,
    isPending: mutation.isPending,
    status,
    message,
  };
}