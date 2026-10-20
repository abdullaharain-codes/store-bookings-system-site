/**
 * Typed wrappers around the public catalog read endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\{Category,Brand,Product}Controller
 * exactly — verified against the controllers rather than guessed:
 * - GET /categories -> { categories: Category[] }
 * - GET /brands     -> { brands: Brand[] }
 * - GET /products   -> Laravel paginator envelope at the TOP level
 *                      ({ data, links, current_page, total, per_page, ... })
 */
import apiClient from "./api-client";

// ─── Entity types (serialized JSON shapes) ──────────────────────────────────

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_published: boolean;
  parent_category_id: number | null;
  logo_asset: Asset | null;
  banner_asset: Asset | null;
  created_at?: string;
  updated_at?: string;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logo_asset_id: number | null;
  banner_asset_id: number | null;
  is_published: boolean;
  logo_asset: Asset | null;
  created_at?: string;
  updated_at?: string;
}

export interface Asset {
  id: number;
  uuid: string;
  disk: string;
  path: string;
  thumbnail_path: string | null;
  /**
   * Fully-resolved browser URL (uploads disk url + path), e.g.
   * `http://localhost:8000/storage/uploads/products/<uuid>.jpg`. Appended
   * server-side (`Asset::$appends`) so frontends can use it directly as an
   * `<img src>` instead of re-assembling the storage disk prefix themselves.
   */
  url: string;
  /**
   * Null when the asset has no thumbnail (`thumbnail_path` is null).
   */
  thumbnail_url: string | null;
  original_name: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
}

export interface ProductImage {
  id: number;
  product_id: number;
  asset_id: number;
  display_order: number;
  asset: Asset;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  sku: string;
  description: string | null;
  /**
   * NOTE: decimal:2 cast on the backend serializes money as a STRING
   * ("1234.56") to avoid floating-point precision loss. Parse before math.
   */
  price: string;
  /**
   * DISCOUNT-1: optional "was price" for a strike-through + discount badge.
   * Money string like `price`, null when the product has no discount. The
   * backend validates that, when present, it is strictly greater than `price`.
   */
  compare_at_price: string | null;
  /**
   * DISCOUNT-1: discount as a whole percent, rounded server-side
   * (`(compare_at_price - price) / compare_at_price * 100`). Null when there
   * is no discount (or `compare_at_price` is at/below `price`). Appended by
   * the Product model, so it rides through every public/admin payload.
   */
  discount_percent: number | null;
  stock_quantity: number;
  brand_id: number | null;
  is_published: boolean;
  /**
   * Admin-set merchandising flag (BE2: `boolean NOT NULL DEFAULT false`, so
   * there is no third state and it is never null). Always present in the public
   * payload because the controllers serialize the model directly.
   */
  is_featured: boolean;
  brand: Brand | null;
  categories: Category[];
  images: ProductImage[];
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface CategoriesResponse {
  categories: Category[];
}

export interface BrandsResponse {
  brands: Brand[];
}

/** Laravel paginator `toArray()` shape (top-level on /products). */
export interface Paginator<T> {
  data: T[];
  links: { url: string | null; label: string; active: boolean }[];
  current_page: number;
  first_page_url: string | null;
  from: number | null;
  last_page: number;
  last_page_url: string | null;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

export type ProductsResponse = Paginator<Product>;

export interface ProductDetailResponse {
  product: Product;
}

export interface CategoryDetailResponse {
  category: Category;
}

export interface BrandDetailResponse {
  brand: Brand;
}

// ─── Client-side per_page clamping ───────────────────────────────────────────

/**
 * Upper bound applied to `getProducts({ perPage })` before the request is made.
 *
 * BE4: the backend now enforces the SAME cap (App\Support\PerPage::MAX = 48)
 * on the public /products and /services lists, so this client-side clamp is a
 * defensive mirror of the server contract rather than the only guard. Keeping
 * it lets callers fail fast on a nonsense page size instead of relying on
 * server-side clamping alone.
 *
 * Lower bound is 1: `per_page=0` makes Laravel's LengthAwarePaginator throw,
 * and a negative value is nonsense rather than a request to make.
 */
const PER_PAGE_MIN = 1;
const PER_PAGE_MAX = 48;

/**
 * Normalises a caller-supplied page size to an integer inside [1, 48].
 * Fractional values are rounded (2.6 -> 3), then clamped.
 *
 * A non-finite value is a programming error, not something to silently paper
 * over: sending `NaN` would reach the server as a nonsense filter, so this
 * throws instead. `perPage: undefined` never reaches here — the caller omits
 * the key entirely and the backend applies its own default.
 */
export function clampPerPage(perPage: number, caller: string): number {
  if (!Number.isFinite(perPage)) {
    throw new RangeError(
      `${caller}: perPage must be a finite number, received ${perPage}.`,
    );
  }
  return Math.min(PER_PAGE_MAX, Math.max(PER_PAGE_MIN, Math.round(perPage)));
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/**
 * Published categories. Without parentId: ALL published categories (both
 * tree levels). With parentId: only the published direct children.
 */
export async function getCategories(parentId?: number): Promise<CategoriesResponse> {
  const { data } = await apiClient.get<CategoriesResponse>("/categories", {
    params: parentId !== undefined ? { parent_id: parentId } : undefined,
  });
  return data;
}

/** Published brands. */
export async function getBrands(): Promise<BrandsResponse> {
  const { data } = await apiClient.get<BrandsResponse>("/brands");
  return data;
}

/**
 * Published products with optional filters. Passing categoryId filters by a
 * category's full scope — a PARENT id includes products assigned to any of
 * its descendants (resolved server-side via Taxonomy).
 *
 * `perPage` is clamped to [1, 48] — see PER_PAGE_MAX for why. Every other
 * filter is forwarded verbatim.
 *
 * `featured` is the one filter that is NOT forwarded verbatim: it is a boolean
 * here and a 1/0 on the wire (BE2's documented contract). `false` must become
 * `0` and not be dropped, because "only non-featured" is a real narrowing and
 * losing it would silently widen the result set to the whole catalogue.
 *
 * Params are built key-by-key rather than as a fixed object of `undefined`
 * values: an explicitly-undefined key still reaches axios and can serialise as
 * the literal string "undefined" depending on the paramsSerializer, so an
 * unset filter must be absent from the object, not present-and-undefined.
 *
 * `minPrice`/`maxPrice`/`inStock` are the BE4 filters: price bounds are sent
 * verbatim as decimals, and `inStock` becomes the 1/0 the server's boolean
 * parser accepts (the same on-the-wire coercion `featured` uses). All three
 * are omitted entirely when unset so "no filter" and "filter to false" stay
 * distinct.
 */
export async function getProducts(filters?: {
  categoryId?: number;
  brandId?: number;
  search?: string;
  sort?: "price_asc" | "price_desc" | "newest";
  featured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  page?: number;
  perPage?: number;
}): Promise<ProductsResponse> {
  const params: Record<string, string | number> = {};

  if (filters?.categoryId !== undefined) params.category_id = filters.categoryId;
  if (filters?.brandId !== undefined) params.brand_id = filters.brandId;
  if (filters?.search !== undefined) params.search = filters.search;
  if (filters?.sort !== undefined) params.sort = filters.sort;
  // `!== undefined` rather than a truthiness check: `false` is a value here.
  if (filters?.featured !== undefined) params.featured = filters.featured ? 1 : 0;
  if (filters?.minPrice !== undefined) params.min_price = filters.minPrice;
  if (filters?.maxPrice !== undefined) params.max_price = filters.maxPrice;
  if (filters?.inStock !== undefined) params.in_stock = filters.inStock ? 1 : 0;
  if (filters?.page !== undefined) params.page = filters.page;
  if (filters?.perPage !== undefined) params.per_page = clampPerPage(filters.perPage, "getProducts");

  const { data } = await apiClient.get<ProductsResponse>("/products", {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return data;
}

/**
 * Published product detail by slug. Missing AND unpublished slugs both 404
 * from the server; axios rejects, so callers see the same failure either way.
 * Shape verified against ProductController::show — `{ product: ... }`.
 */
export async function getProductBySlug(slug: string): Promise<ProductDetailResponse> {
  const { data } = await apiClient.get<ProductDetailResponse>(`/products/${slug}`);
  return data;
}

/**
 * Published category detail by slug (404 for missing/unpublished). Shape
 * verified against CategoryController::show — `{ category: ... }`.
 */
export async function getCategoryBySlug(slug: string): Promise<CategoryDetailResponse> {
  const { data } = await apiClient.get<CategoryDetailResponse>(`/categories/${slug}`);
  return data;
}

/**
 * Published brand detail by slug (404 for missing/unpublished). Shape
 * verified against BrandController::show — `{ brand: ... }`.
 */
export async function getBrandBySlug(slug: string): Promise<BrandDetailResponse> {
  const { data } = await apiClient.get<BrandDetailResponse>(`/brands/${slug}`);
  return data;
}
