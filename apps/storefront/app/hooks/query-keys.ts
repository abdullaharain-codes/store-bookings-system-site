/**
 * Every storefront query key in one place.
 *
 * The shell and the pages must agree on these strings, otherwise a logout can
 * "clear" caches that nothing actually reads and a signed-in user keeps seeing
 * the previous user's data.
 */
export const queryKeys = {
  /** Public taxonomy. Deliberately unparameterised: the nav needs the whole tree. */
  categories: ["categories"] as const,
  brands: ["brands"] as const,
  /** Per-user surfaces. Removed on logout. */
  cart: ["cart"] as const,
  wishlist: ["wishlist"] as const,
  /** Home merchandising rows (design.md §3.7/§3.9). Two different filter sets,
   *  so two keys: sharing one would let New Arrivals and Featured Products read
   *  each other's cache entry. */
  productsNewArrivals: ["catalog", "products", "new-arrivals"] as const,
  productsFeatured: ["catalog", "products", "featured"] as const,
  /**
   * One top-level category's catalogue snippet (Home category strips, TASK
   * B2d-1). Keyed by category id: each strip is its own filter set and must
   * never share a cache entry with the merchandising rows or another strip.
   */
  productsByCategory: (categoryId: number) =>
    ["catalog", "products", "category", categoryId] as const,
  /** Home "Popular Services" row (TASK B2d-2): first page of the published
   *  services catalogue, capped client-side at POPULAR_SERVICES_COUNT. */
  servicesHomepage: ["services", "homepage"] as const,
  /** The /services listing grid (TASK B3-3). One entry per page, so changing
   *  the page keys a NEW request instead of reusing a stale one. */
  servicesList: (page: number) => ["services", "list", page] as const,
  /** Single-service resolution by slug (the /service/:slug detail page). */
  serviceBySlug: (slug: string) => ["services", "by-slug", slug] as const,
  /** Home "Customer Reviews" showcase (TASK B2e-1): first page of the
   *  admin-curated review screenshots, published-only, in display_order. */
  reviewShowcaseHome: ["review-showcase", "homepage"] as const,
  /** The /shop listing grid (TASK B3-1). One entry per resolved + filtered
   *  view, so changing page, sort, price bounds, stock filter, search or the
   *  category/brand scope keys a NEW request instead of reusing a stale one. */
  productsShop: (filters: {
    categoryId?: number;
    brandId?: number;
    search: string | null;
    sort: string;
    minPrice: number | null;
    maxPrice: number | null;
    inStock: boolean | null;
    page: number;
  }) => ["catalog", "products", "shop", filters] as const,
  /** Single-item resolution by slug (detail pages AND the shop header
   *  breadcrumb need the object, not just the id). 404s share these keys so a
   *  previously-missing slug stays cached as a miss until stale. */
  productBySlug: (slug: string) =>
    ["catalog", "products", "by-slug", slug] as const,
  categoryBySlug: (slug: string) =>
    ["catalog", "categories", "by-slug", slug] as const,
  brandBySlug: (slug: string) =>
    ["catalog", "brands", "by-slug", slug] as const,
};

/**
 * Taxonomy changes rarely and is shared by every visitor, so a five-minute
 * window removes a categories + brands round trip from each navigation without
 * making a rename feel stale.
 */
export const TAXONOMY_STALE_TIME = 5 * 60 * 1000;
