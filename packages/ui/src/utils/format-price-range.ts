import { formatPrice } from "./format-price";

/**
 * A service always quotes a price RANGE, never a single bare price. En dash
 * with surrounding spaces, exactly as ServiceCard has always rendered it.
 */
export function formatPriceRange(priceMin: string, priceMax: string): string {
  return `${formatPrice(priceMin)} – ${formatPrice(priceMax)}`;
}