import { forwardRef } from "react";
import type { Product } from "@ecommerce/api-client";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { ClickableArea } from "../ClickableArea";
import { LoadingSkeleton } from "../LoadingSkeleton";
import { formatPrice } from "../../utils/format-price";

interface ProductCardProps {
  product: Product;
  isWishlisted?: boolean;
  isAuthenticated?: boolean;
  onWishlistToggle?: (productId: number) => void;
  onAddToCart?: (productId: number) => void;
  onViewDetails?: () => void;
  compareAtPrice?: string;
  averageRating?: number;
  reviewCount?: number;
  lowStockThreshold?: number;
  isLoading?: boolean;
}

interface StockBadge {
  label: string;
  variant: "success" | "warning" | "error";
}

function discountPercent(compareAtPrice: string | undefined, price: string): number | null {
  if (compareAtPrice === undefined) {
    return null;
  }
  const original = Number(compareAtPrice);
  const current = Number(price);
  if (!Number.isFinite(original) || !Number.isFinite(current) || original <= current) {
    return null;
  }
  return Math.round(((original - current) / original) * 100);
}

function stockBadge(stockQuantity: number, threshold: number): StockBadge {
  if (stockQuantity === 0) {
    return { label: "Out of Stock", variant: "error" };
  }
  if (stockQuantity <= threshold) {
    return { label: "Low Stock", variant: "warning" };
  }
  return { label: "In Stock", variant: "success" };
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export const ProductCard = forwardRef<HTMLDivElement, ProductCardProps>(
  (
    {
      product,
      isWishlisted = false,
      isAuthenticated = false,
      onWishlistToggle,
      onAddToCart,
      onViewDetails,
      compareAtPrice,
      averageRating,
      reviewCount,
      lowStockThreshold = 5,
      isLoading = false,
    },
    ref
  ) => {
    if (isLoading) {
      return <LoadingSkeleton ref={ref} label="Loading product" />;
    }

    const image = product.images[0]?.asset;
    const price = formatPrice(product.price);
    const discount = discountPercent(compareAtPrice, product.price);
    const stock = stockBadge(product.stock_quantity, lowStockThreshold);
    const wishlisted = isAuthenticated && isWishlisted;
    const showRating = averageRating !== undefined;
    const roundedRating = Math.round(averageRating ?? 0);

    return (
      <Card
        ref={ref}
        interactive
        className="flex flex-col gap-[var(--space-3)] overflow-hidden"
      >
        <div className="group relative -mx-4 -mt-4 flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-[var(--color-surface-muted)] p-4">
          <ClickableArea onActivate={onViewDetails} className="h-full w-full">
            {image ? (
              <img
                src={image.path}
                alt={product.name}
                className="h-full w-full object-contain mix-blend-darken transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div aria-hidden="true" className="h-full w-full" />
            )}
          </ClickableArea>
          {/* Opaque frosted chip behind the overlay badge: guarantees separation
              from whatever photo content underneath (product images are arbitrary
              uploads, so the 10%-tint pill alone is not reliably contrast-safe).
              Same backing as the wishlist chip so both overlays read as one
              treatment. Don't remove as "redundant" styling. */}
          <div className="absolute left-[var(--space-3)] top-[var(--space-3)] z-10 rounded-full bg-[var(--color-surface-base)]/90 shadow-[var(--shadow-1)] ring-1 ring-[var(--color-border-default)] backdrop-blur-sm">
            <Badge variant={stock.variant}>{stock.label}</Badge>
          </div>
          {/* Solid chip so the heart always contrasts against arbitrary photo
              content — mirrors the reference's overlay-icon solution: circular
              carousel-arrow buttons over photos use a solid bg-white circle +
              border + shadow rather than a bare icon (homepage code.html). */}
          <div className="absolute right-[var(--space-3)] top-[var(--space-3)] z-10 rounded-full bg-[var(--color-surface-base)]/90 shadow-[var(--shadow-1)] ring-1 ring-[var(--color-border-default)] backdrop-blur-sm">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={wishlisted}
              disabled={!onWishlistToggle}
              onClick={() => onWishlistToggle?.(product.id)}
            >
              <HeartIcon filled={wishlisted} />
            </Button>
          </div>
        </div>

        <ClickableArea onActivate={onViewDetails} className="flex-grow">
          <div className="flex flex-col gap-[var(--space-1)]">
            {product.brand?.name && (
              <span className="text-[length:var(--font-size-label-caps)] font-semibold uppercase tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-muted)]">
                {product.brand.name}
              </span>
            )}
            <h3 className="line-clamp-2 font-[family-name:var(--font-family-display)] text-[length:var(--font-size-md)] font-semibold leading-tight text-[var(--color-text-primary)]">
              {product.name}
            </h3>
          </div>
        </ClickableArea>

        {showRating && (
          <div
            className="flex items-center gap-[var(--space-1)]"
            aria-label={`Rated ${averageRating} out of 5`}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={
                  i < roundedRating
                    ? "text-[var(--color-status-warning)]"
                    : "text-[var(--color-surface-muted)]"
                }
              >
                {i < roundedRating ? "★" : "☆"}
              </span>
            ))}
            {reviewCount !== undefined && (
              <span className="text-xs text-[var(--color-text-secondary)]">
                ({reviewCount})
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between border-t border-[var(--color-border-default)] pt-[var(--space-4)]">
          <div className="flex flex-col items-start gap-[var(--space-1)]">
            <p className="text-[length:var(--font-size-label-caps)] font-semibold tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-muted)]">
              Price
            </p>
            <div className="flex flex-wrap items-baseline gap-[var(--space-2)]">
              <span className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-price-display)] font-bold text-[var(--color-text-primary)]">
                {price}
              </span>
              {discount !== null && (
                <>
                  <span className="text-sm text-[var(--color-text-secondary)] line-through">
                    {formatPrice(compareAtPrice!)}
                  </span>
                  <Badge variant="error">-{discount}%</Badge>
                </>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => onAddToCart?.(product.id)}
            disabled={product.stock_quantity === 0 || !onAddToCart}
          >
            Add to Cart
          </Button>
        </div>
      </Card>
    );
  }
);

ProductCard.displayName = "ProductCard";