import { forwardRef } from "react";
import type { Brand } from "@ecommerce/api-client";
import { ClickableArea } from "../ClickableArea";
import { LoadingSkeleton } from "../LoadingSkeleton";

interface BrandCardProps {
  brand: Brand;
  onActivate?: () => void;
  isLoading?: boolean;
}

export const BrandCard = forwardRef<HTMLDivElement, BrandCardProps>(
  ({ brand, onActivate, isLoading = false }, ref) => {
    if (isLoading) {
      return <LoadingSkeleton ref={ref} label="Loading brand" />;
    }

    return (
      <ClickableArea onActivate={onActivate}>
        <div
          ref={ref}
          className="group flex aspect-square flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-6 transition-[box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-easing-standard)] hover:-translate-y-0.5 hover:border-transparent hover:shadow-[var(--shadow-hover)]"
        >
          {brand.logo_asset && (
            <div className="mb-4 flex h-24 w-24 items-center justify-center">
              <img
                src={brand.logo_asset.url}
                alt=""
                className="max-h-full max-w-full object-contain mix-blend-multiply opacity-80 transition-opacity group-hover:opacity-100"
              />
            </div>
          )}
          <span className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-xl)] font-semibold text-[var(--color-text-primary)]">
            {brand.name}
          </span>
        </div>
      </ClickableArea>
    );
  }
);

BrandCard.displayName = "BrandCard";