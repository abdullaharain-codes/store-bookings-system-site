/**
 * Cart page copy that depends on the line's product name (TASK B4-1c).
 *
 * Kept in its own module, not alongside the CartView component: a file that
 * exports both a component and plain functions breaks React Fast Refresh (the
 * repo's oxlint `react(only-export-components)` rule), so the parameterised
 * strings live here and the component imports them.
 */

/** Accessible name of a line's Remove control (must include the product name). */
export function cartRemoveLabel(name: string): string {
  return `Remove ${name} from cart`;
}

/** Polite announcement after a line is removed. */
export function cartRemovedAnnouncement(name: string): string {
  return `Removed ${name} from cart`;
}

/**
 * Label of the explicit action that re-confirms an expired hold by re-sending
 * the line's CURRENT quantity (TASK B4-2a, Step 1). Lives here so the expired
 * message and the button can never drift apart — CartView composes the message
 * from this constant.
 */
export const CART_RESERVE_LABEL = "Reserve again";

/** Polite announcement after a hold was reserved again. */
export const CART_RESERVED_ANNOUNCEMENT = "Reserved again.";
