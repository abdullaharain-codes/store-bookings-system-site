export function formatPrice(price: string): string {
  return `Rs. ${Number(price).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}