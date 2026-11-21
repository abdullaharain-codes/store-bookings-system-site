export function formatPrice(price: string): string {
  const numeric = Number(price);
  const fraction = numeric % 1;
  const hasPaise = Math.abs(fraction) > 1e-9;

  if (hasPaise) {
    return `Rs. ${numeric.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return `Rs. ${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}