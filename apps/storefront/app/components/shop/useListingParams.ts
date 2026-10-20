import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

const SORT_VALUES: readonly string[] = SORT_OPTIONS.map((option) => option.value);

/**
 * The listing page size. A UI decision, not a business value: the API's own
 * cap (PER_PAGE_MAX = 48) lives in the api-client, and the server clamps the
 * same bound (BE4, App\Support\PerPage::MAX). 12 is the reference layout's
 * grid — 2-up small, 3-up md, 4-up xl fills exactly one row at each breakpoint.
 */
export const PRODUCTS_PER_PAGE = 12;

export interface ListingParams {
  sort: SortOption;
  page: number;
  search: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean | null;
  brand: string | null;
}

export const DEFAULT_LISTING_PARAMS: ListingParams = {
  sort: "newest",
  page: 1,
  search: null,
  minPrice: null,
  maxPrice: null,
  inStock: null,
  brand: null,
};

/** Filter keys whose presence in a patch resets the listing back to page 1. */
const FILTER_KEYS = ["search", "minPrice", "maxPrice", "inStock", "brand", "sort"] as const;

function parseNonNegative(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Reads the URL into typed params with a strict whitelist: anything outside
 * the documented contract (a sort outside SORT_OPTIONS, a page below 1, a
 * negative bound, in_stock other than 1) collapses to the default rather than
 * reaching the API as a nonsense filter.
 */
export function parseListingParams(searchParams: URLSearchParams): ListingParams {
  const rawSort = searchParams.get("sort");
  const sort = rawSort !== null && SORT_VALUES.includes(rawSort) ? (rawSort as SortOption) : "newest";

  const rawPage = searchParams.get("page");
  const page =
    rawPage !== null && /^\d+$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1;

  const rawSearch = searchParams.get("search")?.trim();
  const rawBrand = searchParams.get("brand")?.trim();

  return {
    sort,
    page,
    search: rawSearch ? rawSearch : null,
    minPrice: parseNonNegative(searchParams.get("min_price")),
    maxPrice: parseNonNegative(searchParams.get("max_price")),
    inStock: searchParams.get("in_stock") === "1" ? true : null,
    brand: rawBrand ? rawBrand : null,
  };
}

/**
 * The reverse of parseListingParams: defaults are omitted so the shareable URL
 * stays clean (/shop, not /shop?sort=newest&page=1). Insertion order is part
 * of the contract — tests and humans diff these strings.
 */
export function serializeListingParams(params: ListingParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search !== null) searchParams.set("search", params.search);
  if (params.minPrice !== null) searchParams.set("min_price", String(params.minPrice));
  if (params.maxPrice !== null) searchParams.set("max_price", String(params.maxPrice));
  if (params.inStock !== null) searchParams.set("in_stock", "1");
  if (params.brand !== null) searchParams.set("brand", params.brand);
  if (params.sort !== "newest") searchParams.set("sort", params.sort);
  if (params.page > 1) searchParams.set("page", String(params.page));
  return searchParams;
}

/**
 * Applies a partial update. Any patch that touches a filter re-applies the
 * listing from page 1 (changing the sort or clearing a bound on page 7 would
 * otherwise show the tail of a result set the reader never saw the head of);
 * a page-only patch keeps the page it was given.
 */
export function applyListingPatch(
  current: ListingParams,
  patch: Partial<ListingParams>
): ListingParams {
  const touchesFilter = FILTER_KEYS.some((key) => key in patch);
  const page =
    patch.page !== undefined ? patch.page : touchesFilter ? 1 : current.page;
  return { ...current, ...patch, page };
}

/** True when anything other than the default view is active (page 1 included). */
export function hasActiveFilters(params: ListingParams): boolean {
  return FILTER_KEYS.some((key) => params[key] !== DEFAULT_LISTING_PARAMS[key]) || params.page > 1;
}

/**
 * Listing state lives in the URL, so a filtered /shop view is shareable and
 * survives reload. `update` and `clearAll` are the only writers — components
 * never touch useSearchParams directly.
 */
export function useListingParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => parseListingParams(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<ListingParams>) => {
      setSearchParams(serializeListingParams(applyListingPatch(params, patch)));
    },
    [params, setSearchParams]
  );

  const clearAll = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  return { params, update, clearAll };
}
