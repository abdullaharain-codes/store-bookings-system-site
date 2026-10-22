import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { getOrder, useAuthStore } from "@ecommerce/api-client";
import {
  ErrorState,
  LoadingSkeleton,
  buttonStyles,
  formatPrice,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { isNotFoundError } from "../../lib/is-not-found";
import { useAnnounce } from "../common/Announcer";
import { DetailNotFound } from "../common/DetailNotFound";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";
import { formatPlacedDate } from "./format-placed-date";
import {
  ORDER_DETAIL_ADDRESS_LABEL,
  ORDER_DETAIL_BACK_HREF,
  ORDER_DETAIL_BACK_LABEL,
  ORDER_DETAIL_COD_LABEL,
  ORDER_DETAIL_CONTINUE_HREF,
  ORDER_DETAIL_CONTINUE_LABEL,
  ORDER_DETAIL_ERROR_MESSAGE,
  ORDER_DETAIL_ERROR_TITLE,
  ORDER_DETAIL_FALLBACK_LABEL,
  ORDER_DETAIL_ITEMS_LABEL,
  ORDER_DETAIL_LOADING_LABEL,
  ORDER_DETAIL_NOT_FOUND_MESSAGE,
  ORDER_DETAIL_NOT_FOUND_TITLE,
  ORDER_DETAIL_PAYMENT_LABEL,
  ORDER_DETAIL_PAYMENT_STATUS_LABEL,
  ORDER_DETAIL_PLACED_ANNOUNCEMENT,
  ORDER_DETAIL_PLACED_LABEL,
  ORDER_DETAIL_PLACED_MESSAGE,
  ORDER_DETAIL_RETRY_LABEL,
  ORDER_DETAIL_SHIPPING_LABEL,
  ORDER_DETAIL_STATUS_LABEL,
  ORDER_DETAIL_SUBTOTAL_LABEL,
  ORDER_DETAIL_TOTAL_LABEL,
  orderItemLabel,
  orderPaymentStatusLabel,
  orderStatusLabel,
} from "./order-copy";

/**
 * /account/orders/:id (TASK B4-2a).
 *
 * Reads one order through the shared react-query cache and renders only what the
 * SERVER already computed — subtotal/shipping/total are the server's own money
 * strings via formatPrice and are never recomputed here. The address and the
 * item lines are the order's immutable snapshot, not live catalogue data.
 *
 * `?placed=1` (set by the checkout redirect) shows the success banner and makes
 * a polite announcement exactly once per mount. A missing OR foreign order is
 * the same server 404, so both render the shared DetailNotFound.
 */
export function OrderDetailView({ orderId }: { orderId: number }) {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [searchParams] = useSearchParams();
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // A non-numeric / non-positive :id can never be a real order, so treat it as
  // not-found IMMEDIATELY — no request, no endless skeleton.
  const validId = Number.isInteger(orderId) && orderId > 0;

  const orderQuery = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: () => getOrder(orderId),
    enabled: isSessionChecked && isAuthenticated && validId,
    retry: false,
  });

  const order = orderQuery.data?.order;
  const notFound =
    !validId || (orderQuery.isError && isNotFoundError(orderQuery.error));
  const showPlaced = searchParams.get("placed") === "1";
  const placedDate = formatPlacedDate(order?.created_at);

  // Announce the placement exactly once, after the order has actually rendered
  // (so screen readers hear it with the banner already in the DOM).
  const announcedRef = useRef(false);
  useEffect(() => {
    if (showPlaced && order && !announcedRef.current) {
      announcedRef.current = true;
      announce(ORDER_DETAIL_PLACED_ANNOUNCEMENT);
    }
  }, [showPlaced, order, announce]);

  const pageTitle = notFound
    ? ORDER_DETAIL_NOT_FOUND_TITLE
    : order
      ? `Order ${order.order_number}`
      : ORDER_DETAIL_FALLBACK_LABEL;

  return (
    <>
      <title>{`${pageTitle} | ${siteConfig.name}`}</title>
      {notFound && <meta name="robots" content="noindex" />}

      <PageContainer>
        {notFound ? (
          <DetailNotFound
            title={ORDER_DETAIL_NOT_FOUND_TITLE}
            message={ORDER_DETAIL_NOT_FOUND_MESSAGE}
            breadcrumbItems={[
              { label: "Account", href: ORDER_DETAIL_BACK_HREF },
              { label: ORDER_DETAIL_FALLBACK_LABEL },
            ]}
            backHref={ORDER_DETAIL_BACK_HREF}
            backLabel={ORDER_DETAIL_BACK_LABEL}
            onNavigate={(href) => navigate(href)}
          />
        ) : orderQuery.isError ? (
          <>
            <h1 className="sr-only">{ORDER_DETAIL_ERROR_TITLE}</h1>
            <ErrorState
              title={ORDER_DETAIL_ERROR_TITLE}
              message={ORDER_DETAIL_ERROR_MESSAGE}
              retryLabel={ORDER_DETAIL_RETRY_LABEL}
              onRetry={() => orderQuery.refetch()}
            />
          </>
        ) : !order ? (
          <>
            <h1 className="sr-only">{ORDER_DETAIL_LOADING_LABEL}</h1>
            <LoadingSkeleton label={ORDER_DETAIL_LOADING_LABEL} />
          </>
        ) : (
          <>
            <PageHeading>{`Order ${order.order_number}`}</PageHeading>

            {showPlaced && (
              <p
                role="status"
                className="mt-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-status-success)] bg-[var(--color-surface-base)] p-[var(--space-3)] text-sm text-[var(--color-text-primary)]"
              >
                {ORDER_DETAIL_PLACED_MESSAGE}
              </p>
            )}

            <dl className="mt-[var(--space-4)] grid gap-[var(--space-2)] text-sm sm:grid-cols-2">
              <OrderFact
                label={ORDER_DETAIL_STATUS_LABEL}
                value={orderStatusLabel(order.status)}
              />
              <OrderFact
                label={ORDER_DETAIL_PAYMENT_STATUS_LABEL}
                value={orderPaymentStatusLabel(order.payment_status)}
              />
              {placedDate && (
                <OrderFact
                  label={ORDER_DETAIL_PLACED_LABEL}
                  value={placedDate}
                />
              )}
              <OrderFact
                label={ORDER_DETAIL_PAYMENT_LABEL}
                value={ORDER_DETAIL_COD_LABEL}
              />
            </dl>

            <div className="mt-[var(--space-6)] grid gap-[var(--space-6)] lg:grid-cols-[1.6fr_1fr]">
              <section
                aria-label={ORDER_DETAIL_ITEMS_LABEL}
                className="flex flex-col gap-[var(--space-3)]"
              >
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {ORDER_DETAIL_ITEMS_LABEL}
                </h2>
                <ul className="flex flex-col gap-[var(--space-3)]">
                  {order.items?.map((item) => (
                    <li
                      key={item.id}
                      aria-label={orderItemLabel(item.product_name)}
                      className="flex items-start justify-between gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border-default)] p-[var(--space-3)] text-sm"
                    >
                      <span className="flex flex-col text-[var(--color-text-primary)]">
                        <span className="font-medium">{item.product_name}</span>
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {`${item.quantity} × ${formatPrice(item.unit_price)}`}
                        </span>
                      </span>
                      <span className="text-[var(--color-text-primary)]">
                        {formatPrice(item.line_total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="flex flex-col gap-[var(--space-6)]">
                <section
                  aria-label={ORDER_DETAIL_ADDRESS_LABEL}
                  className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)] text-sm"
                >
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {ORDER_DETAIL_ADDRESS_LABEL}
                  </h2>
                  <p className="text-[var(--color-text-primary)]">
                    {order.recipient_name}
                  </p>
                  <p className="text-[var(--color-text-secondary)]">
                    {order.address_line_1}
                    {order.address_line_2 ? `, ${order.address_line_2}` : ""}
                    {`, ${order.city}`}
                    {order.postal_code ? ` ${order.postal_code}` : ""}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {order.phone}
                  </p>
                </section>

                <section
                  aria-label={ORDER_DETAIL_TOTAL_LABEL}
                  className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-[var(--space-4)]"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">
                      {ORDER_DETAIL_SUBTOTAL_LABEL}
                    </span>
                    <span
                      data-testid="order-subtotal"
                      className="text-[var(--color-text-primary)]"
                    >
                      {formatPrice(order.subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">
                      {ORDER_DETAIL_SHIPPING_LABEL}
                    </span>
                    <span
                      data-testid="order-shipping"
                      className="text-[var(--color-text-primary)]"
                    >
                      {formatPrice(order.shipping_fee)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--color-border-default)] pt-[var(--space-2)]">
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {ORDER_DETAIL_TOTAL_LABEL}
                    </span>
                    <span
                      data-testid="order-total"
                      className="text-base font-semibold text-[var(--color-text-primary)]"
                    >
                      {formatPrice(order.total)}
                    </span>
                  </div>
                </section>
              </div>
            </div>

            <div className="mt-[var(--space-6)]">
              <Link
                to={ORDER_DETAIL_CONTINUE_HREF}
                className={buttonStyles({ variant: "primary" })}
              >
                {ORDER_DETAIL_CONTINUE_LABEL}
              </Link>
            </div>
          </>
        )}
      </PageContainer>
    </>
  );
}

function OrderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="text-[var(--color-text-primary)]">{value}</dd>
    </div>
  );
}
