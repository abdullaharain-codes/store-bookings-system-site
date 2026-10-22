/**
 * Wishlist page copy (TASK B4-2b).
 *
 * Kept in its own module, not alongside WishlistView: a file that exports both a
 * component and plain strings breaks React Fast Refresh (the repo's oxlint
 * `react(only-export-components)` rule), so the user-facing strings live here.
 */

/** The one visible h1, in every state. */
export const WISHLIST_TITLE = "Wishlist";
export const WISHLIST_LOADING_LABEL = "Loading wishlist";
export const WISHLIST_ERROR_TITLE = "Wishlist unavailable";
export const WISHLIST_ERROR_MESSAGE =
  "Your wishlist could not be loaded. Please try again.";
export const WISHLIST_RETRY_LABEL = "Try again";
export const WISHLIST_EMPTY_TITLE = "Your wishlist is empty";
export const WISHLIST_EMPTY_DESCRIPTION =
  "Browse the shop and tap the heart on a product to save it here.";
export const WISHLIST_EMPTY_LINK_LABEL = "Browse the shop";
export const WISHLIST_GRID_LABEL = "Saved products";
