import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  getCart,
  removeCartItem,
  updateCartItem,
  useAuthStore,
  type CartItem,
} from "@ecommerce/api-client";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  QuantityInput,
  formatPrice,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { multiplyMoney, sumMoney } from "../../lib/money";
import { useAnnounce } from "../common/Announcer";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";
import { cartRemoveLabel, cartRemovedAnnouncement } from "./cart-copy";

/** The one visible h1, in every state (loading, error, empty, populated). */
export const CART_TITLE = "Cart";
export const CART_LOADING_LABEL = "Loading cart";
export const CART_ERROR_TITLE = "Cart unavailable";
export const CART_ERROR_MESSAGE =
  "Your cart could not be loaded. Please try again.";
export const CART_RETRY_LABEL = "Try again";
export const CART_EMPTY_TITLE = "Your cart is empty";
export const CART_EMPTY_DESCRIPTION =
  "Browse the shop and add products to get started.";
export const CART_EMPTY_LINK_LABEL = "Continue shopping";
export const CART_LIST_LABEL = "Cart items";
export const CART_SUMMARY_LABEL = "Order summary";
export const CART_SUBTOTAL_LABEL = "Subtotal (estimate)";
export const CART_SHIPPING_NOTE = "Shipping is calculated at checkout.";
export const CART_CHECKOUT_LABEL = "Proceed to checkout";
export const CART_IMAGE_PLACEHOLDER = "No image";
export const CART_FALLBACK_PRODUCT_NAME = "Product";
export const CART_HOLD_ACTIVE_LABEL = "Reserved";
export const CART_HOLD_EXPIRED_MESSAGE =
  "Your reservation for this item expired. Set the quantity again to re-confirm it.";
export const CART_UPDATED_ANNOUNCEMENT = "Cart updated.";
export const CART_QUANTITY_ERROR_FALLBACK =
  "We couldn't update that quantity. Please try again.";
export const CART_REMOVE_ERROR_FALLBACK =
  "We couldn't remove that item. Please try again.";

/** Accessible name of a line's quantity field, so lines never collide. */
function cartQuantityLabel(name: string): string {
  return `Quantity for ${name}`;
}

/**
 * A 409/422 carries the server's own stock message verbatim (CartService's
 * "Only N left in stock..." reach the shopper); anything else collapses to the
 * caller's generic line so raw error text is never rendered.
 */
function cartErrorMessage(error: unknown, fallback: string): string {
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
    if ((status === 409 || status === 422) && message) return message;
  }
  return fallback;
}

/**
 * /cart (TASK B4-1c). Loader-free like the rest of the storefront: the cart is
 * read through `queryKeys.cart` — the SAME cache entry the header badge uses, so
 * the page and the badge never issue two requests for the same data.
 *
 * Quantity edits and removals invalidate ONLY that key. A rejected quantity
 * (stock/409/422) shows the server's message inline, resets the field to the
 * server quantity and announces it; the announce goes through the site's single
 * live region (components/common/Announcer).
 */
export function CartView() {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Per-line inline error text and a reset token that remounts a line's
  // QuantityInput so a rejected value snaps back to the server quantity.
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [resetTokens, setResetTokens] = useState<Record<number, number>>({});

  const cartQuery = useQuery({
    queryKey: queryKeys.cart,
    queryFn: getCart,
    enabled: isSessionChecked && isAuthenticated,
  });

  const items = cartQuery.data?.cart.items ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      updateCartItem(id, quantity),
    onSuccess: (_data, variables) => {
      setLineErrors((previous) => {
        const next = { ...previous };
        delete next[variables.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      announce(CART_UPDATED_ANNOUNCEMENT);
    },
    onError: (error, variables) => {
      const message = cartErrorMessage(error, CART_QUANTITY_ERROR_FALLBACK);
      setLineErrors((previous) => ({ ...previous, [variables.id]: message }));
      setResetTokens((previous) => ({
        ...previous,
        [variables.id]: (previous[variables.id] ?? 0) + 1,
      }));
      announce(message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ id }: { id: number; name: string }) => removeCartItem(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      announce(cartRemovedAnnouncement(variables.name));
    },
    onError: (error) => {
      announce(cartErrorMessage(error, CART_REMOVE_ERROR_FALLBACK));
    },
  });

  const changeQuantity = useCallback(
    (item: CartItem, quantity: number) => {
      if (updateMutation.isPending || removeMutation.isPending) return;
      if (quantity === item.quantity) return;
      setLineErrors((previous) => {
        if (!(item.id in previous)) return previous;
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      updateMutation.mutate({ id: item.id, quantity });
    },
    [updateMutation, removeMutation.isPending],
  );

  const removeItem = useCallback(
    (item: CartItem, name: string) => {
      if (updateMutation.isPending || removeMutation.isPending) return;
      removeMutation.mutate({ id: item.id, name });
    },
    [updateMutation.isPending, removeMutation],
  );

  const subtotal = sumMoney(
    items.map((item) =>
      item.product ? multiplyMoney(item.product.price, item.quantity) : "0.00",
    ),
  );

  return (
    <>
      <title>{`${CART_TITLE} | ${siteConfig.name}`}</title>
      <PageContainer>
        <PageHeading>{CART_TITLE}</PageHeading>

        {cartQuery.isPending ? (
          <LoadingSkeleton label={CART_LOADING_LABEL} />
        ) : cartQuery.isError ? (
          <ErrorState
            title={CART_ERROR_TITLE}
            message={CART_ERROR_MESSAGE}
            retryLabel={CART_RETRY_LABEL}
            onRetry={() => cartQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-[var(--space-3)]">
            <EmptyState
              title={CART_EMPTY_TITLE}
              description={CART_EMPTY_DESCRIPTION}
            />
            <Link
              to="/shop"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-brand-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-brand-accent)]"
            >
              {CART_EMPTY_LINK_LABEL}
            </Link>
          </div>
        ) : (
          <>
            <ul
              aria-label={CART_LIST_LABEL}
              className="flex flex-col gap-[var(--space-4)]"
            >
              {items.map((item) => {
                const name = item.product?.name ?? CART_FALLBACK_PRODUCT_NAME;
                const updatePending =
                  updateMutation.isPending &&
                  updateMutation.variables?.id === item.id;
                const removePending =
                  removeMutation.isPending &&
                  removeMutation.variables?.id === item.id;
                return (
                  <li
                    key={`${item.id}-${resetTokens[item.id] ?? 0}`}
                    className="flex flex-col gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)] sm:flex-row sm:items-center"
                  >
                    {item.product?.images[0]?.asset ? (
                      <img
                        src={
                          item.product.images[0].asset.thumbnail_url ??
                          item.product.images[0].asset.url
                        }
                        alt={
                          item.product.images[0].asset.alt_text ??
                          item.product.name
                        }
                        width={item.product.images[0].asset.width ?? undefined}
                        height={item.product.images[0].asset.height ?? undefined}
                        loading="lazy"
                        className="h-20 w-20 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border-default)] object-contain"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-text-secondary)]">
                        {CART_IMAGE_PLACEHOLDER}
                      </div>
                    )}

                    <div className="flex flex-1 flex-col gap-[var(--space-2)]">
                      {item.product ? (
                        <Link
                          to={`/product/${item.product.slug}`}
                          className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-brand-accent)]"
                        >
                          {item.product.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {name}
                        </span>
                      )}

                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {item.product ? formatPrice(item.product.price) : ""}
                      </span>

                      {item.hold_status === "active" && (
                        <Badge variant="success">
                          {CART_HOLD_ACTIVE_LABEL}
                        </Badge>
                      )}
                      {item.hold_status === "expired" && (
                        <p className="text-xs text-[var(--color-status-warning)]">
                          {CART_HOLD_EXPIRED_MESSAGE}
                        </p>
                      )}

                      {lineErrors[item.id] && (
                        <p className="text-xs text-[var(--color-status-error)]">
                          {lineErrors[item.id]}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-start gap-[var(--space-3)] sm:items-end">
                      <QuantityInput
                        id={`cart-item-quantity-${item.id}`}
                        label={cartQuantityLabel(name)}
                        value={item.quantity}
                        max={item.product?.stock_quantity}
                        disabled={updatePending || removePending}
                        onChange={(quantity) => changeQuantity(item, quantity)}
                      />

                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        {item.product
                          ? formatPrice(
                              multiplyMoney(item.product.price, item.quantity),
                            )
                          : ""}
                      </span>

                      <button
                        type="button"
                        aria-label={cartRemoveLabel(name)}
                        disabled={updatePending || removePending}
                        onClick={() => removeItem(item, name)}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-status-error)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <section
              aria-label={CART_SUMMARY_LABEL}
              className="flex flex-col items-end gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]"
            >
              <div className="flex w-full items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">
                  {CART_SUBTOTAL_LABEL}
                </span>
                <span
                  data-testid="cart-subtotal"
                  className="text-base font-semibold text-[var(--color-text-primary)]"
                >
                  {formatPrice(subtotal)}
                </span>
              </div>
              <p className="w-full text-xs text-[var(--color-text-secondary)]">
                {CART_SHIPPING_NOTE}
              </p>
              <Link
                to="/checkout"
                className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-brand-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-brand-accent)]"
              >
                {CART_CHECKOUT_LABEL}
              </Link>
            </section>
          </>
        )}
      </PageContainer>
    </>
  );
}
