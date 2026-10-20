import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { getServices } from "@ecommerce/api-client";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Pagination,
  ServiceCard,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { useRedirectToLastPage } from "../../hooks/use-redirect-to-last-page";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";

/**
 * /services listing (TASK B3-3). Loader-free like the rest of the storefront:
 * the page is fetched client-side through the shared query key, so the route
 * file is a thin wrapper and the prerender set is unchanged. The listing page
 * lives in ?page= so a paginated view is shareable and survives reload.
 */
export function ServiceListing() {
  const navigate = useNavigate();
  const [page, setPage] = usePageParam();

  const servicesQuery = useQuery({
    queryKey: queryKeys.servicesList(page),
    queryFn: () => getServices(page > 1 ? page : undefined, SERVICES_PER_PAGE),
    placeholderData: keepPreviousData,
  });

  const data = servicesQuery.data;

  useRedirectToLastPage(data, (lastPage) =>
    lastPage > 1 ? `/services?page=${lastPage}` : "/services",
  );

  return (
    <>
      <title>{`Services | ${siteConfig.name}`}</title>
      <PageContainer>
        <PageHeading>Services</PageHeading>
        {servicesQuery.isPending ? (
          <LoadingSkeleton label="Loading services" items={3} />
        ) : servicesQuery.isError ? (
          <ErrorState
            title="Services unavailable"
            message="The service listing could not be loaded. Please try again."
            retryLabel="Try again"
            onRetry={() => servicesQuery.refetch()}
          />
        ) : data && data.data.length === 0 && data.total === 0 ? (
          <EmptyState
            title="No services yet"
            description="Published services will appear here as soon as they are available."
          />
        ) : data ? (
          <>
            <ul
              aria-label="Services"
              className="grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3"
            >
              {data.data.map((service) => (
                <li key={service.id}>
                  <ServiceCard
                    service={service}
                    href={`/service/${service.slug}`}
                    onViewDetails={() => navigate(`/service/${service.slug}`)}
                    onBookNow={() => navigate("/booking")}
                  />
                </li>
              ))}
            </ul>
            <div className="flex justify-center">
              <Pagination
                currentPage={data.current_page}
                lastPage={data.last_page}
                getHref={(next) =>
                  next > 1 ? `/services?page=${next}` : "/services"
                }
                onPageChange={setPage}
              />
            </div>
          </>
        ) : null}
      </PageContainer>
    </>
  );
}

/** The /services page size (8/9-view grid fills one row at each breakpoint). */
const SERVICES_PER_PAGE = 12;

/**
 * Reads the listing page from ?page= and writes it back, omitting page=1 so the
 * canonical URL stays clean (/services, never /services?page=1). Deliberately a
 * tiny local hook: useListingParams owns the shop's whole filter surface.
 */
function usePageParam(): [number, (page: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("page");
  const page =
    raw !== null && /^\d+$/.test(raw) && Number(raw) >= 1 ? Number(raw) : 1;

  const setPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams);
      if (next > 1) {
        params.set("page", String(next));
      } else {
        params.delete("page");
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  return [page, setPage];
}