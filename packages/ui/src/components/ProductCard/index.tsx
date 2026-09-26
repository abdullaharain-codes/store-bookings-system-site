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
        className="flex flex-col gap-[var(--space-3)]"
      >
        <div className="relative">
          <ClickableArea onActivate={onViewDetails}>
            {image ? (
              <img
                src={image.path}
                alt={product.name}
                className="h-40 w-full rounded-[var(--radius-sm)] object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-40 w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
              />
            )}
          </ClickableArea>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wishlisted}
            className="absolute right-0 top-0"
            disabled={!onWishlistToggle}
            onClick={() => onWishlistToggle?.(product.id)}
          >
            <HeartIcon filled={wishlisted} />
          </Button>
        </div>

        <ClickableArea onActivate={onViewDetails}>
          <div className="flex flex-col gap-[var(--space-1)]">
            {product.brand?.name && (
              <span className="text-xs text-[var(--color-text-secondary)]">
                {product.brand.name}
              </span>
            )}
            <h3 className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)]">
              {product.name}
            </h3>
          </div>
        </ClickableArea>

        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <span className="text-base font-semibold text-[var(--color-text-primary)]">
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

        <div className="mt-auto flex items-center justify-between gap-[var(--space-3)]">
          <Badge variant={stock.variant}>{stock.label}</Badge>
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