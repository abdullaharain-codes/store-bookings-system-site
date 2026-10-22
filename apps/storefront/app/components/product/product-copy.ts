/**
 * Product-detail copy (TASK B4-2b).
 *
 * Kept in its own module, not alongside ProductDetail: a file that exports both
 * a component and plain strings breaks React Fast Refresh (the repo's oxlint
 * `react(only-export-components)` rule), so the user-facing strings live here
 * and the component imports them.
 */

/** The wishlist action's two labels (driven by `isWishlisted`). */
export const PRODUCT_ADD_WISHLIST_LABEL = "Add to wishlist";
export const PRODUCT_REMOVE_WISHLIST_LABEL = "Remove from wishlist";

/** The Buy now action (adds the line then routes to checkout). */
export const PRODUCT_BUY_NOW_LABEL = "Buy now";
export const PRODUCT_ADD_TO_CART_LABEL = "Add to Cart";
