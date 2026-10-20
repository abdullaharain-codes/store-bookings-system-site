import { forwardRef, type HTMLAttributes } from "react";
import { clsx } from "clsx";
import { Badge } from "../Badge";
import { formatPrice } from "../../utils/format-price";

/**
 * The product price block shared by ProductCard and the product detail page
 * (rules.md §3 DRY). Renders the selling price, plus — only when the server
 * computed a `discountPercent` — the inert compare-at price with a
 * visually-hidden "Original price:" label and the -N% badge.
 *
 * Branching on the server's `discount_percent` (not on `compare_at_price`) is
 * load-bearing: a compare-at present with a null percent means the server
 * decided there is no discount, so neither the struck price nor the badge may
 * render.
 */
interface PriceTagProps extends HTMLAttributes<HTMLDivElement> {
  price: string;
  compareAtPrice: string | null;
  discountPercent: number | null;
}

export const PriceTag = forwardRef<HTMLDivElement, PriceTagProps>(
  ({ price, compareAtPrice, discountPercent, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "flex flex-wrap items-baseline gap-[var(--space-2)]",
          className
        )}
        {...props}
      >
        <span className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-price-display)] font-bold text-[var(--color-text-primary)]">
          {formatPrice(price)}
        </span>
        {discountPercent !== null && (
          <>
            {/* `<s>` + visually-hidden label: the strikethrough is the reference's
                visual treatment, and the sr-only text makes the read-aloud order
                "Original price …  Rs. 520,000" next to the live price instead of
                an unexplained crossed-out number. No trailing space in the
                sr-only text: testing-library compares raw textContent. */}
            <s className="text-sm text-[var(--color-text-secondary)] line-through">
              <span className="sr-only">Original price:</span>
              {" "}
              {formatPrice(compareAtPrice ?? price)}
            </s>
            <Badge variant="error">-{discountPercent}%</Badge>
          </>
        )}
      </div>
    );
  }
);

PriceTag.displayName = "PriceTag";
