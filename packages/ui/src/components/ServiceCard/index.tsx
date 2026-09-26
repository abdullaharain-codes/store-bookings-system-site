import { forwardRef } from "react";
import type { Service } from "@ecommerce/api-client";
import { Button } from "../Button";
import { Card } from "../Card";
import { ClickableArea } from "../ClickableArea";
import { LoadingSkeleton } from "../LoadingSkeleton";
import { formatPrice } from "../../utils/format-price";

interface ServiceCardProps {
  service: Service;
  onBookNow?: () => void;
  onViewDetails?: () => void;
  isLoading?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  const hourLabel = `${hours} hr${hours > 1 ? "s" : ""}`;
  return remaining === 0 ? hourLabel : `${hourLabel} ${remaining} min`;
}

export const ServiceCard = forwardRef<HTMLDivElement, ServiceCardProps>(
  ({ service, onBookNow, onViewDetails, isLoading = false }, ref) => {
    if (isLoading) {
      return <LoadingSkeleton ref={ref} label="Loading service" />;
    }

    const priceRange = `${formatPrice(service.price_min)} – ${formatPrice(service.price_max)}`;

    return (
      <Card ref={ref} className="flex flex-col gap-[var(--space-3)]">
        <ClickableArea onActivate={onViewDetails}>
          <div className="flex flex-col gap-[var(--space-1)]">
            <h3 className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)]">
              {service.name}
            </h3>
            {service.description && (
              <p className="line-clamp-2 text-sm text-[var(--color-text-secondary)]">
                {service.description}
              </p>
            )}
          </div>
        </ClickableArea>

        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <span className="text-base font-semibold text-[var(--color-text-primary)]">
            {priceRange}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-[var(--space-3)]">
          <span className="text-xs text-[var(--color-text-secondary)]">
            {formatDuration(service.duration_minutes)}
          </span>
          <Button type="button" variant="primary" onClick={() => onBookNow?.()}>
            Book Now
          </Button>
        </div>
      </Card>
    );
  }
);

ServiceCard.displayName = "ServiceCard";