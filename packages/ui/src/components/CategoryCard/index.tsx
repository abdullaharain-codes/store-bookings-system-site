import { forwardRef } from "react";
import type { Category } from "@ecommerce/api-client";
import { Card } from "../Card";
import { ClickableArea } from "../ClickableArea";
import { LoadingSkeleton } from "../LoadingSkeleton";

interface CategoryCardProps {
  category: Category;
  itemCount?: number;
  onActivate?: () => void;
  isLoading?: boolean;
}

export const CategoryCard = forwardRef<HTMLDivElement, CategoryCardProps>(
  ({ category, itemCount, onActivate, isLoading = false }, ref) => {
    if (isLoading) {
      return <LoadingSkeleton ref={ref} label="Loading category" />;
    }

    return (
      <ClickableArea onActivate={onActivate}>
        <Card ref={ref} className="flex flex-col gap-[var(--space-3)]">
          {category.logo_asset ? (
            <img
              src={category.logo_asset.path}
              alt={category.name}
              className="h-40 w-full rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-40 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
            />
          )}
          <div className="flex flex-col gap-[var(--space-1)]">
            <h3 className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)]">
              {category.name}
            </h3>
            {itemCount !== undefined && (
              <span className="text-xs text-[var(--color-text-secondary)]">
                {itemCount} {itemCount === 1 ? "product" : "products"}
              </span>
            )}
          </div>
        </Card>
      </ClickableArea>
    );
  }
);

CategoryCard.displayName = "CategoryCard";