import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { getServiceBySlug, type Service } from "@ecommerce/api-client";
import {
  Breadcrumb,
  type BreadcrumbItem,
  ErrorState,
  LoadingSkeleton,
  buttonStyles,
  formatDuration,
  formatPriceRange,
} from "@ecommerce/ui";
import { META_DESCRIPTION_MAX } from "../../config/seo";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import { isNotFoundError } from "../../lib/is-not-found";
import { DetailNotFound } from "../common/DetailNotFound";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";

/**
 * /service/:slug (TASK B3-3). Loader-free like the rest of the storefront: the
 * service is fetched client-side, so the route file stays thin. The Service
 * type has no image/asset field, so no gallery branch exists.
 */
interface ServiceDetailProps {
  slug: string;
}

export function ServiceDetail({ slug }: ServiceDetailProps) {
  const navigate = useNavigate();

  const serviceQuery = useQuery({
    queryKey: queryKeys.serviceBySlug(slug),
    queryFn: () => getServiceBySlug(slug),
    enabled: Boolean(slug),
    retry: false,
  });

  const service = serviceQuery.data;
  const notFound = serviceQuery.isError && isNotFoundError(serviceQuery.error);
  const metaDescription = service?.description
    ? service.description.slice(0, META_DESCRIPTION_MAX)
    : null;
  const pageTitle = notFound ? "Service not found" : (service?.name ?? "Service");

  return (
    <>
      <title>{`${pageTitle} | ${siteConfig.name}`}</title>
      {notFound && <meta name="robots" content="noindex" />}
      {metaDescription && <meta name="description" content={metaDescription} />}

      <PageContainer>
        {notFound ? (
          <DetailNotFound
            title="Service not found"
            message="This service does not exist or is no longer available."
            breadcrumbItems={[
              { label: "Home", href: "/" },
              { label: "Services", href: "/services" },
            ]}
            backHref="/services"
            backLabel="Back to services"
            onNavigate={(href) => navigate(href)}
          />
        ) : serviceQuery.isError ? (
          <>
            <h1 className="sr-only">Service unavailable</h1>
            <ErrorState
              title="Service unavailable"
              message="This service could not be loaded. Please try again."
              retryLabel="Try again"
              onRetry={() => serviceQuery.refetch()}
            />
          </>
        ) : !service ? (
          <>
            <h1 className="sr-only">Loading service</h1>
            <LoadingSkeleton label="Loading service" />
          </>
        ) : (
          <ServiceDetailContent key={service.id} service={service} />
        )}
      </PageContainer>
    </>
  );
}

function ServiceDetailContent({ service }: { service: Service }) {
  const navigate = useNavigate();

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/services" },
    { label: service.name },
  ];

  return (
    <>
      <Breadcrumb
        items={breadcrumbItems}
        onNavigate={(href) => navigate(href)}
      />
      <PageHeading>{service.name}</PageHeading>

      <div className="flex flex-col items-start gap-[var(--space-4)]">
        <span className="text-sm text-[var(--color-text-secondary)]">
          {formatDuration(service.duration_minutes)}
        </span>

        <div className="flex flex-col items-start gap-[var(--space-1)]">
          <span className="text-[length:var(--font-size-label-caps)] font-semibold tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-muted)]">
            Estimated Price
          </span>
          <span className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-price-display)] font-bold text-[var(--color-text-primary)]">
            {formatPriceRange(service.price_min, service.price_max)}
          </span>
        </div>

        {service.description && (
          <p className="whitespace-pre-line text-sm text-[var(--color-text-secondary)]">
            {service.description}
          </p>
        )}

        <Link to="/booking" className={buttonStyles({ variant: "primary" })}>
          Book this service
        </Link>
      </div>
    </>
  );
}