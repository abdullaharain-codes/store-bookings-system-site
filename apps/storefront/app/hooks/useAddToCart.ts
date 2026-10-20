import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import {
  addCartItem,
  buildAddCartItemRequest,
  useAuthStore,
  useRedirectAndResume,
} from "@ecommerce/api-client";
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

function apiErrorDetail(error: unknown): { status: number; message: string } {
  if (typeof error === "object" && error !== null) {
    const err = error as {
      response?: { status?: unknown; data?: { message?: unknown } };
    };
    const status =
      typeof err.response?.status === "number" ? err.response.status : 0;
    const message =
      typeof err.response?.data?.message === "string"
        ? err.response.data.message
        : "";
    return { status, message };
  }
  return { status: 0, message: "" };
}

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
  const location = useLocation();
  const queryClient = useQueryClient();
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [status, setStatus] = useState<AddToCartStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // The request the mutation last tried, so a 401 can re-defer it verbatim.
  const lastRequestRef = useRef<{ productId: number; quantity: number } | null>(
    null
  );

  const deferToTheLogin = useCallback(
    (productId: number, quantity: number) => {
      requireAuth({
        ...buildAddCartItemRequest(productId, quantity),
        targetRoute: location.pathname + location.search,
      });
    },
    [location.pathname, location.search, requireAuth]
  );

  const mutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: number; quantity: number }) =>
      addCartItem(productId, quantity),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      setStatus("success");
      setMessage(ADD_TO_CART_SUCCESS_MESSAGE);
    },
    onError: (error) => {
      const { status: httpStatus, message: serverMessage } =
        apiErrorDetail(error);

      if (httpStatus === 401) {
        const last = lastRequestRef.current;
        if (last) deferToTheLogin(last.productId, last.quantity);
        setStatus("guest");
        setMessage(null);
        return;
      }

      setStatus("error");
      setMessage(
        (httpStatus === 409 || httpStatus === 422) && serverMessage
          ? serverMessage
          : ADD_TO_CART_GENERIC_ERROR_MESSAGE
      );
    },
  });

  const addToCart = useCallback(
    (productId: number, quantity: number = 1) => {
      if (!Number.isInteger(quantity) || quantity < 1 || mutation.isPending) {
        if (!Number.isInteger(quantity) || quantity < 1) {
          setStatus("error");
          setMessage(ADD_TO_CART_GENERIC_ERROR_MESSAGE);
        }
        return;
      }

      lastRequestRef.current = { productId, quantity };

      if (isSessionChecked && !isAuthenticated) {
        setStatus("guest");
        setMessage(null);
        deferToTheLogin(productId, quantity);
        return;
      }

      setStatus("pending");
      setMessage(null);
      mutation.mutate({ productId, quantity });
    },
    [mutation, isSessionChecked, isAuthenticated, deferToTheLogin]
  );

  return {
    addToCart,
    isPending: mutation.isPending,
    status,
    message,
  };
}