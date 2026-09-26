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
  created_at?: string;
  updated_at?: string;
}

export interface Asset {
  id: number;
  uuid: string;
  disk: string;
  path: string;
  thumbnail_path: string | null;
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
  stock_quantity: number;
  brand_id: number | null;
  is_published: boolean;
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
 */
export async function getProducts(filters?: {
  categoryId?: number;
  brandId?: number;
  search?: string;
  sort?: "price_asc" | "price_desc";
  page?: number;
}): Promise<ProductsResponse> {
  const { data } = await apiClient.get<ProductsResponse>("/products", {
    params: {
      category_id: filters?.categoryId,
      brand_id: filters?.brandId,
      search: filters?.search,
      sort: filters?.sort,
      page: filters?.page,
    },
  });
  return data;
}
