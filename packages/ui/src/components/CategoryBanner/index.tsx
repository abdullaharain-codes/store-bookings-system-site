import type { Category } from "@ecommerce/api-client";
import { LoadingSkeleton } from "../LoadingSkeleton";

interface CategoryBannerProps {
  category: Category;
  isLoading?: boolean;
}

export const CategoryBanner = ({ category, isLoading = false }: CategoryBannerProps) => {
  if (isLoading) {
    return (
      <LoadingSkeleton
        label="Loading category banner"
        className="h-[200px] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] md:h-[280px]"
        items={1}
        lines={0}
      />
    );
  }

  if (!category.banner_asset) {
    return null;
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
      <img
        src={category.banner_asset.url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-surface-dark)]/80 via-[var(--color-surface-dark)]/50 to-transparent" />
      <div className="flex h-[200px] items-center md:h-[280px]">
        <div className="px-[var(--space-6)] md:px-[var(--space-7)]">
          <h1 className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-2xl)] font-semibold text-white md:text-[length:var(--font-size-3xl)]">
            {category.name}
          </h1>
        </div>
      </div>
    </div>
  );
};

CategoryBanner.displayName = "CategoryBanner";