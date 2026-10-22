/**
 * Order-detail copy and label maps (TASK B4-2a).
 *
 * Kept in its own module, not alongside OrderDetailView: a file that exports
 * both a component and plain values breaks React Fast Refresh (the repo's
 * oxlint `react(only-export-components)` rule), so the user-facing strings and
 * the label maps live here.
 */

/** The value the server uses when it has no better label. */
export const ORDER_DETAIL_FALLBACK_LABEL = "Order";

/* ── titles / states ─────────────────────────────────────────────────────── */
export const ORDER_DETAIL_LOADING_LABEL = "Loading order";
export const ORDER_DETAIL_ERROR_TITLE = "Order unavailable";
export const ORDER_DETAIL_ERROR_MESSAGE =
  "Your order could not be loaded. Please try again.";
export const ORDER_DETAIL_RETRY_LABEL = "Try again";
export const ORDER_DETAIL_NOT_FOUND_TITLE = "Order not found";
export const ORDER_DETAIL_NOT_FOUND_MESSAGE =
  "We couldn't find that order. It may have been removed, or it isn't yours.";
export const ORDER_DETAIL_BACK_LABEL = "Back to account";
export const ORDER_DETAIL_BACK_HREF = "/account";
export const ORDER_DETAIL_CONTINUE_LABEL = "Continue shopping";
export const ORDER_DETAIL_CONTINUE_HREF = "/shop";

/* ── placed banner ───────────────────────────────────────────────────────── */
export const ORDER_DETAIL_PLACED_MESSAGE =
  "Thank you — your order has been placed";
export const ORDER_DETAIL_PLACED_ANNOUNCEMENT =
  "Thank you — your order has been placed";

/* ── section headings / field labels ─────────────────────────────────────── */
export const ORDER_DETAIL_ITEMS_LABEL = "Items";
export const ORDER_DETAIL_ADDRESS_LABEL = "Delivery address";
export const ORDER_DETAIL_PAYMENT_LABEL = "Payment";
export const ORDER_DETAIL_STATUS_LABEL = "Status";
export const ORDER_DETAIL_PAYMENT_STATUS_LABEL = "Payment status";
export const ORDER_DETAIL_PLACED_LABEL = "Placed";
export const ORDER_DETAIL_SUBTOTAL_LABEL = "Subtotal";
export const ORDER_DETAIL_SHIPPING_LABEL = "Shipping";
export const ORDER_DETAIL_TOTAL_LABEL = "Total";
export const ORDER_DETAIL_COD_LABEL = "Cash on delivery";

/** Accessible name for an item's line (needs the product name). */
export function orderItemLabel(name: string): string {
  return `${name} line item`;
}

/* ── label maps (unknown values fall back to the raw server value) ───────── */

/** Order statuses from OrderService (pending/confirmed/shipped/delivered/cancelled). */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Payment statuses from OrderService (pending/paid). */
export const ORDER_PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
};

/** Human label for a status value; an unknown value renders verbatim. */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Human label for a payment status value; an unknown value renders verbatim. */
export function orderPaymentStatusLabel(paymentStatus: string): string {
  return ORDER_PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus;
}
