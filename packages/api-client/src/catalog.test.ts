import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet },
}));

import {
  getBrandBySlug,
  getBrands,
  getCategoryBySlug,
  getCategories,
  getProductBySlug,
  getProducts,
} from "./catalog";
import type { Brand, Category, Paginator, Product } from "./catalog";

/** Reads the `params` object off the recorded apiClient.get call. */
function sentParams(): unknown {
  return mockGet.mock.calls[0][1]?.params;
}

const category: Category = {
  id: 3,
  name: "Gaming Laptops",
  slug: "gaming-laptops",
  description: null,
  display_order: 1,
  is_published: true,
  parent_category_id: 1,
  logo_asset: null,
  banner_asset: null,
};

const brand: Brand = {
  id: 2,
  name: "HP",
  slug: "hp",
  description: null,
  logo_asset_id: null,
  banner_asset_id: null,
  is_published: true,
  logo_asset: null,
};

const product: Product = {
  id: 11,
  name: "ThinkPad X1 Carbon",
  slug: "thinkpad-x1-carbon",
  sku: "TPX1-11",
  description: null,
  price: "450000.00",
  compare_at_price: "520000.00",
  discount_percent: 13,
  stock_quantity: 4,
  brand_id: 1,
  is_published: true,
  is_featured: false,
  brand,
  categories: [category],
  images: [],
};

function paginator<T>(items: T[]): Paginator<T> {
  return {
    data: items,
    links: [],
    current_page: 1,
    first_page_url: null,
    from: items.length ? 1 : null,
    last_page: 1,
    last_page_url: null,
    next_page_url: null,
    path: "http://localhost:8000/api/v1/products",
    per_page: 15,
    prev_page_url: null,
    to: items.length || null,
    total: items.length,
  };
}

describe("catalog", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  // ─── getCategories ─────────────────────────────────────────────────────────

  it("getCategories sends no params when parentId is omitted", async () => {
    mockGet.mockResolvedValue({ data: { categories: [category] } });

    const result = await getCategories();

    expect(mockGet).toHaveBeenCalledWith("/categories", { params: undefined });
    expect(result).toEqual({ categories: [category] });
  });

  it("getCategories maps parentId to the parent_id query param", async () => {
    mockGet.mockResolvedValue({ data: { categories: [category] } });

    await getCategories(1);

    expect(mockGet).toHaveBeenCalledWith("/categories", {
      params: { parent_id: 1 },
    });
  });

  it("getCategories sends parent_id=0 rather than dropping it", async () => {
    mockGet.mockResolvedValue({ data: { categories: [] } });

    await getCategories(0);

    // Guards against a falsy-check regression: 0 is a value, not "absent".
    expect(sentParams()).toStrictEqual({ parent_id: 0 });
  });

  it("getCategories propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("network down"));

    await expect(getCategories()).rejects.toThrow("network down");
  });

  // ─── getBrands ─────────────────────────────────────────────────────────────

  it("getBrands calls /brands with no config and unwraps the envelope", async () => {
    mockGet.mockResolvedValue({ data: { brands: [brand] } });

    const result = await getBrands();

    expect(mockGet).toHaveBeenCalledWith("/brands");
    expect(result).toEqual({ brands: [brand] });
  });

  it("getBrands propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("network down"));

    await expect(getBrands()).rejects.toThrow("network down");
  });

  // ─── getProducts ───────────────────────────────────────────────────────────

  it("getProducts sends no params when called with no filters", async () => {
    mockGet.mockResolvedValue({ data: paginator([product]) });

    const result = await getProducts();

    expect(mockGet).toHaveBeenCalledWith("/products", { params: undefined });
    expect(result.data).toEqual([product]);
  });

  it("getProducts sends no params for an empty filter object", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({});

    expect(sentParams()).toBeUndefined();
  });

  it("getProducts maps categoryId to category_id", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ categoryId: 3 });

    expect(sentParams()).toStrictEqual({ category_id: 3 });
  });

  it("getProducts maps brandId to brand_id", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ brandId: 2 });

    expect(sentParams()).toStrictEqual({ brand_id: 2 });
  });

  it("getProducts maps search to search", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ search: "thinkpad" });

    expect(sentParams()).toStrictEqual({ search: "thinkpad" });
  });

  it("getProducts maps both sort directions to sort", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ sort: "price_asc" });
    expect(sentParams()).toStrictEqual({ sort: "price_asc" });

    mockGet.mockClear();
    await getProducts({ sort: "price_desc" });
    expect(sentParams()).toStrictEqual({ sort: "price_desc" });
  });

  it("getProducts maps page to page", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ page: 2 });

    expect(sentParams()).toStrictEqual({ page: 2 });
  });

  it("getProducts omits every unset filter rather than sending undefined", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ page: 2 });

    // The real hazard: an explicit `undefined` key still reaches axios and can
    // serialise as the string "undefined" depending on the paramsSerializer.
    const params = sentParams() as Record<string, unknown>;
    expect(Object.keys(params)).toStrictEqual(["page"]);
    for (const key of [
      "category_id",
      "brand_id",
      "search",
      "sort",
      "per_page",
      "min_price",
      "max_price",
      "in_stock",
    ]) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it("getProducts sends every filter together", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({
      categoryId: 3,
      brandId: 2,
      search: "x1",
      sort: "price_asc",
      page: 2,
      perPage: 24,
    });

    expect(sentParams()).toStrictEqual({
      category_id: 3,
      brand_id: 2,
      search: "x1",
      sort: "price_asc",
      page: 2,
      per_page: 24,
    });
  });

  // ─── getProducts BE4 filters: minPrice / maxPrice / inStock ─────────────────

  it("getProducts maps minPrice to min_price verbatim", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ minPrice: 5000 });

    expect(sentParams()).toStrictEqual({ min_price: 5000 });
  });

  it("getProducts maps maxPrice to max_price verbatim", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ maxPrice: 1234.56 });

    expect(sentParams()).toStrictEqual({ max_price: 1234.56 });
  });

  it("getProducts sends both price bounds when both are set", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ minPrice: 5000, maxPrice: 9000 });

    expect(sentParams()).toStrictEqual({ min_price: 5000, max_price: 9000 });
  });

  it("getProducts sends in_stock=1 when inStock is true", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ inStock: true });

    expect(sentParams()).toStrictEqual({ in_stock: 1 });
  });

  it("getProducts sends in_stock=0 when inStock is false", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    // Guards against a falsy-check regression: `false` means "only
    // out-of-stock", NOT an absent filter.
    await getProducts({ inStock: false });

    expect(sentParams()).toStrictEqual({ in_stock: 0 });
  });

  it("getProducts omits the BE4 filters entirely when unset", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ sort: "newest" });

    const params = sentParams() as Record<string, unknown>;
    expect(params).not.toHaveProperty("min_price");
    expect(params).not.toHaveProperty("max_price");
    expect(params).not.toHaveProperty("in_stock");
    expect(Object.keys(params)).toStrictEqual(["sort"]);
  });

  // ─── by-slug detail wrappers (BE4) ─────────────────────────────────────────

  it("getProductBySlug calls /products/{slug} and unwraps the product", async () => {
    mockGet.mockResolvedValue({ data: { product } });

    const result = await getProductBySlug("thinkpad-x1-carbon");

    expect(mockGet).toHaveBeenCalledWith("/products/thinkpad-x1-carbon");
    expect(result).toEqual({ product });
  });

  it("getProductBySlug propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("404 not found"));

    await expect(getProductBySlug("missing")).rejects.toThrow("404 not found");
  });

  it("getCategoryBySlug calls /categories/{slug} and unwraps the category", async () => {
    mockGet.mockResolvedValue({ data: { category } });

    const result = await getCategoryBySlug("gaming-laptops");

    expect(mockGet).toHaveBeenCalledWith("/categories/gaming-laptops");
    expect(result).toEqual({ category });
  });

  it("getCategoryBySlug propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("404 not found"));

    await expect(getCategoryBySlug("missing")).rejects.toThrow("404 not found");
  });

  it("getBrandBySlug calls /brands/{slug} and unwraps the brand", async () => {
    mockGet.mockResolvedValue({ data: { brand } });

    const result = await getBrandBySlug("hp");

    expect(mockGet).toHaveBeenCalledWith("/brands/hp");
    expect(result).toEqual({ brand });
  });

  it("getBrandBySlug propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("404 not found"));

    await expect(getBrandBySlug("missing")).rejects.toThrow("404 not found");
  });

  // ─── getProducts featured filter (TASK B2c) ─────────────────────────────────

  it("getProducts sends featured=1 when featured is true", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ featured: true });

    // 1, not "true": the wire format is BE2's documented contract.
    expect(sentParams()).toStrictEqual({ featured: 1 });
  });

  it("getProducts sends featured=0 when featured is false", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ featured: false });

    // Guards against a falsy-check regression: `false` is a request for
    // non-featured products, NOT an absent filter. Dropping it would silently
    // widen the result set to the whole catalogue.
    expect(sentParams()).toStrictEqual({ featured: 0 });
  });

  it("getProducts omits featured entirely when it is undefined", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ sort: "newest" });

    const params = sentParams() as Record<string, unknown>;
    expect(params).not.toHaveProperty("featured");
    expect(Object.keys(params)).toStrictEqual(["sort"]);
  });

  it("getProducts sends featured=false as an explicit 0 alongside other filters", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ featured: false, perPage: 8, sort: "newest" });

    expect(sentParams()).toStrictEqual({ sort: "newest", per_page: 8, featured: 0 });
  });

  it("getProducts accepts sort=newest", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ sort: "newest", featured: true, perPage: 8 });

    expect(sentParams()).toStrictEqual({ sort: "newest", per_page: 8, featured: 1 });
  });

  // ─── getProducts perPage clamping ──────────────────────────────────────────

  it("getProducts sends an in-range perPage unchanged", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ perPage: 1 });
    expect(sentParams()).toStrictEqual({ per_page: 1 });

    mockGet.mockClear();
    await getProducts({ perPage: 48 });
    expect(sentParams()).toStrictEqual({ per_page: 48 });

    mockGet.mockClear();
    await getProducts({ perPage: 15 });
    expect(sentParams()).toStrictEqual({ per_page: 15 });
  });

  it("getProducts clamps perPage above the cap down to 48", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ perPage: 500 });

    expect(sentParams()).toStrictEqual({ per_page: 48 });
  });

  it("getProducts clamps perPage below one up to 1", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ perPage: 0 });
    expect(sentParams()).toStrictEqual({ per_page: 1 });

    mockGet.mockClear();
    await getProducts({ perPage: -20 });
    expect(sentParams()).toStrictEqual({ per_page: 1 });
  });

  it("getProducts rounds a fractional perPage to an integer before clamping", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await getProducts({ perPage: 2.6 });
    expect(sentParams()).toStrictEqual({ per_page: 3 });

    mockGet.mockClear();
    await getProducts({ perPage: 1.4 });
    expect(sentParams()).toStrictEqual({ per_page: 1 });

    // A fraction above the cap clamps after rounding, not before.
    mockGet.mockClear();
    await getProducts({ perPage: 47.7 });
    expect(sentParams()).toStrictEqual({ per_page: 48 });
  });

  it("getProducts throws rather than sending a non-finite perPage", async () => {
    mockGet.mockResolvedValue({ data: paginator([]) });

    await expect(getProducts({ perPage: Number.NaN })).rejects.toThrow(RangeError);
    await expect(getProducts({ perPage: Number.POSITIVE_INFINITY })).rejects.toThrow(
      RangeError
    );
    await expect(getProducts({ perPage: Number.NEGATIVE_INFINITY })).rejects.toThrow(
      RangeError
    );

    // Nothing invalid may reach the wire.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("getProducts propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("network down"));

    await expect(getProducts()).rejects.toThrow("network down");
  });
});
