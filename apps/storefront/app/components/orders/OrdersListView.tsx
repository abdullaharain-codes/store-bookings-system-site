import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { listOrders } from "@ecommerce/api-client";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Pagination,
  buttonStyles,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { useRedirectToLastPage } from "../../hooks/use-redirect-to-last-page";
import { formatPrice } from "@ecommerce/ui";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";
import { formatPlacedDate } from "./format-placed-date";
import { orderStatusBadgeVariant } from "./order-status-variant";
import {
  ORDERS_LIST_EMPTY_ACTION_HREF,
  ORDERS_LIST_EMPTY_ACTION_LABEL,
  ORDERS_LIST_EMPTY_MESSAGE,
  ORDERS_LIST_EMPTY_TITLE,
  ORDERS_LIST_ERROR_MESSAGE,
  ORDERS_LIST_ERROR_TITLE,
  ORDERS_LIST_LOADING_LABEL,
  ORDERS_LIST_ORDER_NUMBER_LABEL,
  ORDERS_LIST_PAGE_ARIA_LABEL,
  ORDERS_LIST_PLACED_LABEL,
  ORDERS_LIST_RETRY_LABEL,
  ORDERS_LIST_TITLE,
  ORDERS_LIST_TOTAL_LABEL,
  orderStatusLabel,
} from "./order-copy";

function parsePage(raw: string | null): number {
  if (raw === null) return 1;
  if (/^\d+$/.test(raw)) {
    const page = Number(raw);
    if (page >= 1) return page;
  }
  return 1;
}

function setPageParam(
  searchParams: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  page: number,
) {
  const params = new URLSearchParams(searchParams);
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }
  setSearchParams(params);
}

export function OrdersListView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get("page"));

  const ordersQuery = useQuery({
    queryKey: queryKeys.ordersPage(page),
    queryFn: () => listOrders(page > 1 ? page : undefined),
    placeholderData: keepPreviousData,
  });

  const data = ordersQuery.data?.orders;

  useRedirectToLastPage(data, (lastPage) =>
    lastPage > 1
      ? `/account/orders?page=${lastPage}`
      : "/account/orders",
  );

  const hasOrders = data && data.data.length > 0;
  const isEmpty =
    data && data.data.length === 0 && data.total === 0;

  return (
    <>
      <title>{`${ORDERS_LIST_TITLE} | ${siteConfig.name}`}</title>
      <PageContainer>
        {ordersQuery.isPending ? (
          <>
            <h1 className="sr-only">{ORDERS_LIST_LOADING_LABEL}</h1>
            <LoadingSkeleton label={ORDERS_LIST_LOADING_LABEL} items={3} />
          </>
        ) : ordersQuery.isError ? (
          <>
            <h1 className="sr-only">{ORDERS_LIST_ERROR_TITLE}</h1>
            <ErrorState
              title={ORDERS_LIST_ERROR_TITLE}
              message={ORDERS_LIST_ERROR_MESSAGE}
              retryLabel={ORDERS_LIST_RETRY_LABEL}
              onRetry={() => ordersQuery.refetch()}
            />
          </>
        ) : isEmpty ? (
          <>
            <h1 className="sr-only">{ORDERS_LIST_EMPTY_TITLE}</h1>
            <EmptyState
              title={ORDERS_LIST_EMPTY_TITLE}
              description={ORDERS_LIST_EMPTY_MESSAGE}
            />
            <div className="flex justify-center">
              <Link
                to={ORDERS_LIST_EMPTY_ACTION_HREF}
                className={buttonStyles({ variant: "primary" })}
              >
                {ORDERS_LIST_EMPTY_ACTION_LABEL}
              </Link>
            </div>
          </>
        ) : hasOrders && data ? (
          <>
            <PageHeading>{ORDERS_LIST_TITLE}</PageHeading>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] text-left">
                    <th className="pb-[var(--space-2)] font-medium text-[var(--color-text-secondary)]">
                      {ORDERS_LIST_ORDER_NUMBER_LABEL}
                    </th>
                    <th className="pb-[var(--space-2)] font-medium text-[var(--color-text-secondary)]">
                      {ORDERS_LIST_PLACED_LABEL}
                    </th>
                    <th className="pb-[var(--space-2)] font-medium text-[var(--color-text-secondary)]">
                      Status
                    </th>
                    <th className="pb-[var(--space-2)] text-right font-medium text-[var(--color-text-secondary)]">
                      {ORDERS_LIST_TOTAL_LABEL}
                    </th>
                    <th className="pb-[var(--space-2)]">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((order) => {
                    const placed = formatPlacedDate(order.created_at);
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-[var(--color-border-default)]"
                      >
                        <td className="py-[var(--space-3)] text-[var(--color-text-primary)]">
                          <Link
                            to={`/account/orders/${order.id}`}
                            className="font-medium text-[var(--color-brand-accent)] hover:underline"
                          >
                            {order.order_number}
                          </Link>
                        </td>
                        <td className="py-[var(--space-3)] text-[var(--color-text-secondary)]">
                          {placed}
                        </td>
                        <td className="py-[var(--space-3)]">
                          <Badge variant={orderStatusBadgeVariant(order.status)}>
                            {orderStatusLabel(order.status)}
                          </Badge>
                        </td>
                        <td className="py-[var(--space-3)] text-right text-[var(--color-text-primary)]">
                          {formatPrice(order.total)}
                        </td>
                        <td className="py-[var(--space-3)] text-right">
                          <Link
                            to={`/account/orders/${order.id}`}
                            className="text-[var(--color-brand-accent)] hover:underline"
                          >
                            View order
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center">
              <Pagination
                currentPage={data.current_page}
                lastPage={data.last_page}
                ariaLabel={ORDERS_LIST_PAGE_ARIA_LABEL}
                getHref={(next) =>
                  next > 1 ? `/account/orders?page=${next}` : "/account/orders"
                }
                onPageChange={(next) =>
                  setPageParam(searchParams, setSearchParams, next)
                }
              />
            </div>
          </>
        ) : null}
      </PageContainer>
    </>
  );
}
