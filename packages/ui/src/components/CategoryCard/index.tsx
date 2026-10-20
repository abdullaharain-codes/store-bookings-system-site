import { forwardRef } from "react";
import type { Category } from "@ecommerce/api-client";
import { ClickableArea } from "../ClickableArea";
import { LoadingSkeleton } from "../LoadingSkeleton";

interface CategoryCardProps {
  category: Category;
  onActivate?: () => void;
  isLoading?: boolean;
}

export const CategoryCard = forwardRef<HTMLDivElement, CategoryCardProps>(
  ({ category, onActivate, isLoading = false }, ref) => {
    if (isLoading) {
      return <LoadingSkeleton ref={ref} label="Loading category" />;
    }

    return (
      <ClickableArea onActivate={onActivate}>
        <div
          ref={ref}
          className="flex cursor-pointer items-center gap-3 whitespace-nowrap rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-10 py-6 transition-[box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-easing-standard)] hover:shadow-[var(--shadow-hover)]"
        >
          {category.logo_asset && (
            <img
              src={category.logo_asset.url}
              alt=""
              className="h-8 w-8 shrink-0 object-contain"
            />
          )}
          <span className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-md)] font-semibold leading-tight text-[var(--color-text-primary)]">
            {category.name}
          </span>
        </div>
      </ClickableArea>
    );
  }
);

CategoryCard.displayName = "CategoryCard";