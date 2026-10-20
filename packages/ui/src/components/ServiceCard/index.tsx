import { forwardRef } from "react";
import type { Service } from "@ecommerce/api-client";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { ClickableArea } from "../ClickableArea";
import { LoadingSkeleton } from "../LoadingSkeleton";
import { formatDuration } from "../../utils/format-duration";
import { formatPriceRange } from "../../utils/format-price-range";

interface ServiceCardProps {
  service: Service;
  /** Optional service category label (e.g. "Hardware"). Not in the Service
   *  type/data model yet — supplied by the caller until a service-category
   *  field lands (same pattern as CategoryCard's itemCount). Omitted when absent. */
  category?: string;
  onBookNow?: () => void;
  onViewDetails?: () => void;
  /**
   * Real destination for the card's details action (name/description area).
   * Optional and additive: omitting it keeps the pre-B2d-2 behaviour, where the
   * main action is `onViewDetails` on an `href="#"` placeholder anchor.
   *
   * Pass BOTH when the card should be a genuine link *and* a client-side route
   * change — `packages/ui` has no router, so `href` alone would full-page load.
   */
  href?: string;
  isLoading?: boolean;
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export const ServiceCard = forwardRef<HTMLDivElement, ServiceCardProps>(
  ({ service, category, onBookNow, onViewDetails, href, isLoading = false }, ref) => {
    if (isLoading) {
      return <LoadingSkeleton ref={ref} label="Loading service" />;
    }

    const priceRange = formatPriceRange(service.price_min, service.price_max);

    return (
      <Card ref={ref} interactive className="flex flex-col gap-[var(--space-3)]">
        {category !== undefined && (
          <div className="flex justify-end">
            <Badge
              variant="info"
              className="uppercase tracking-[var(--letter-spacing-label-caps)]"
            >
              {category}
            </Badge>
          </div>
        )}

        <ClickableArea onActivate={onViewDetails} href={href} className="flex-grow">
          <div className="flex flex-col gap-[var(--space-1)]">
            <h3 className="line-clamp-2 font-[family-name:var(--font-family-display)] text-[length:var(--font-size-md)] font-semibold leading-tight text-[var(--color-text-primary)]">
              {service.name}
            </h3>
            {service.description && (
              <p className="line-clamp-2 text-sm text-[var(--color-text-secondary)]">
                {service.description}
              </p>
            )}
          </div>
        </ClickableArea>

        <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
          <ClockIcon />
          <span className="text-sm">{formatDuration(service.duration_minutes)}</span>
        </div>

        <div className="mt-auto flex flex-col gap-[var(--space-3)] border-t border-[var(--color-border-default)] pt-[var(--space-4)]">
          <div className="flex flex-col items-start gap-[var(--space-1)]">
            <p className="text-[length:var(--font-size-label-caps)] font-semibold tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-muted)]">
              Estimated Price
            </p>
            <span className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-price-display)] font-bold text-[var(--color-text-primary)]">
              {priceRange}
            </span>
          </div>
          <Button
            type="button"
            variant="accent"
            className="w-full uppercase"
            onClick={() => onBookNow?.()}
          >
            Book Service
          </Button>
        </div>
      </Card>
    );
  }
);

ServiceCard.displayName = "ServiceCard";