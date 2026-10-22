/**
 * Checkout page copy (TASK B4-2a).
 *
 * Kept in its own module, not alongside CheckoutView: a file that exports both
 * a component and plain strings breaks React Fast Refresh (the repo's oxlint
 * `react(only-export-components)` rule), so the user-facing strings live here
 * and the component imports them. Every string is a named constant so a test
 * asserts against the same source the UI renders.
 */

/** The one visible h1, in every state. */
export const CHECKOUT_TITLE = "Checkout";
export const CHECKOUT_LOADING_LABEL = "Loading checkout";
export const CHECKOUT_ERROR_TITLE = "Checkout unavailable";
export const CHECKOUT_ERROR_MESSAGE =
  "Your checkout could not be loaded. Please try again.";
export const CHECKOUT_RETRY_LABEL = "Try again";

/** Order summary labels. */
export const CHECKOUT_SUMMARY_LABEL = "Order summary";
export const CHECKOUT_SUBTOTAL_LABEL = "Subtotal (estimate)";
export const CHECKOUT_SHIPPING_LABEL = "Shipping";
export const CHECKOUT_TOTAL_LABEL = "Total (estimate)";
export const CHECKOUT_TOTAL_NOTE =
  "Final amounts are confirmed on your order.";
/** Shown when the shipping-fee endpoint fails — checkout must NOT block. */
export const CHECKOUT_SHIPPING_UNKNOWN = "Shipping will be shown on your order.";
export const CHECKOUT_TOTAL_EXCLUDES_SHIPPING =
  "Total excludes shipping.";

/** Payment section (COD only — no payment inputs). */
export const CHECKOUT_PAYMENT_LABEL = "Payment";
export const CHECKOUT_COD_LABEL = "Cash on delivery";
export const CHECKOUT_COD_NOTE =
  "Pay in cash when your order is delivered.";

/** Address section. */
export const CHECKOUT_ADDRESS_LEGEND = "Delivery address";
export const CHECKOUT_ADD_ADDRESS_LABEL = "Add a new address";
export const CHECKOUT_SAVE_ADDRESS_LABEL = "Save address";
export const CHECKOUT_CANCEL_ADDRESS_LABEL = "Cancel";

/** Field labels mirror the server's real field names. */
export const CHECKOUT_FIELD_LABELS = {
  recipient_name: "Recipient name",
  phone: "Phone",
  address_line_1: "Address line 1",
  address_line_2: "Address line 2 (optional)",
  city: "City",
  postal_code: "Postal code (optional)",
  label: "Label (optional)",
} as const;

/** Client-side required-field messages (mirror StoreAddressRequest rules). */
export const CHECKOUT_FIELD_REQUIRED = {
  recipient_name: "Enter the recipient's name.",
  phone: "Enter a phone number.",
  address_line_1: "Enter the first line of the address.",
  city: "Enter a city.",
} as const;

/** Server-side max lengths (mirror StoreAddressRequest::rules exactly). */
export const CHECKOUT_FIELD_MAX = {
  recipient_name: 255,
  phone: 20,
  address_line_1: 255,
  address_line_2: 255,
  city: 100,
  postal_code: 20,
  label: 50,
} as const;

/** Hard cap on a field's string length, from the server's own rule. */
export function checkoutLengthError(
  field: keyof typeof CHECKOUT_FIELD_MAX,
  label: string
): string {
  return `${label} must be ${CHECKOUT_FIELD_MAX[field]} characters or fewer.`;
}

/** Expired-hold blocking alert. */
export const CHECKOUT_HOLD_EXPIRED_TITLE =
  "Some items are no longer reserved.";
export const CHECKOUT_HOLD_EXPIRED_BODY =
  "Re-confirm them in your cart before placing your order.";
export const CHECKOUT_HOLD_EXPIRED_LINK = "Go to cart";

/** Empty-cart state. */
export const CHECKOUT_EMPTY_TITLE = "Your cart is empty";
export const CHECKOUT_EMPTY_DESCRIPTION =
  "Add products to your cart before checking out.";
export const CHECKOUT_EMPTY_LINK = "Continue shopping";

/** Place-order action. */
export const CHECKOUT_PLACE_ORDER_LABEL = "Place order (Cash on delivery)";
export const CHECKOUT_PLACED_ANNOUNCEMENT = "Order placed";
export const CHECKOUT_PLACE_ERROR_FALLBACK =
  "We couldn't place your order. Please try again.";
export const CHECKOUT_ADDRESS_ERROR_FALLBACK =
  "We couldn't save that address. Please try again.";

/** The /account/orders/:id URL a successful placement lands on. */
export function checkoutOrderPath(orderId: number): string {
  return `/account/orders/${orderId}?placed=1`;
}
