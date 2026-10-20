import { describe, expect, it } from "vitest";
import {
  getProducts,
  getReviewShowcase,
  getServices,
  getShippingFee,
} from "@ecommerce/api-client";
import {
  callCounts,
  productRequests,
  reviewShowcaseRequests,
  servicesListRequests,
  setServicesListSource,
  setShippingFeeSource,
  testProducts,
  testServices,
} from "./handlers";

/**
 * These exercise the real client functions against the real MSW handlers, so
 * they prove the two agree on the wire. A unit test with a mocked apiClient
 * cannot catch a param the client meant to send but never did.
 */
describe("products handler", () => {
  it("returns published products paginated with the server default", async () => {
    const result = await getProducts();

    expect(callCounts.products).toBe(1);
    expect(result.data).toHaveLength(4);
    expect(result.per_page).toBe(15);
    expect(result.total).toBe(4);
    expect(result.current_page).toBe(1);
    expect(result.links).toEqual([]);
  });

  it("hides unpublished products from the public endpoint", async () => {
    const result = await getProducts();

    expect(result.data.map((product) => product.id)).not.toContain(15);
    expect(result.data.map((product) => product.id)).toEqual([11, 12, 13, 14]);
  });

  it("omits per_page entirely when the caller does not ask for a page size", async () => {
    await getProducts();

    // The regression this guards: an explicit `per_page: undefined` still
    // serialises, and would pin a page size the caller never chose.
    expect(productRequests[0].params.has("per_page")).toBe(false);
  });

  it("honours an in-range perPage", async () => {
    const result = await getProducts({ perPage: 2 });

    expect(productRequests[0].params.get("per_page")).toBe("2");
    expect(result.data.map((product) => product.id)).toEqual([11, 12]);
    expect(result.per_page).toBe(2);
    expect(result.total).toBe(4);
    expect(result.last_page).toBe(2);
  });

  it("returns the second page for a paginated request", async () => {
    const result = await getProducts({ page: 2, perPage: 2 });

    expect(result.data.map((product) => product.id)).toEqual([13, 14]);
    expect(result.current_page).toBe(2);
    expect(result.from).toBe(3);
    expect(result.to).toBe(4);
  });

  it("clamps an oversized perPage to 48 on both sides of the request", async () => {
    const result = await getProducts({ perPage: 500 });

    expect(productRequests[0].params.get("per_page")).toBe("48");
    expect(result.per_page).toBe(48);
    expect(result.data).toHaveLength(4);
  });

  it("clamps a perPage below one to 1", async () => {
    const result = await getProducts({ perPage: 0 });

    expect(productRequests[0].params.get("per_page")).toBe("1");
    expect(result.per_page).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it("filters by a leaf category", async () => {
    const result = await getProducts({ categoryId: 3 });

    expect(productRequests[0].params.get("category_id")).toBe("3");
    expect(result.data.map((product) => product.id)).toEqual([13, 14]);
  });

  it("filters a parent category across its descendants", async () => {
    // Category 1 (Laptops) is the parent of 2 and 3, so it covers all four
    // published products — the same full-scope behaviour the real controller
    // gets from its Taxonomy scope.
    const parent = await getProducts({ categoryId: 1 });
    expect(parent.data.map((product) => product.id)).toEqual([11, 12, 13, 14]);

    const child = await getProducts({ categoryId: 2 });
    expect(child.data.map((product) => product.id)).toEqual([11]);
  });

  it("sorts by price ascending and descending", async () => {
    const asc = await getProducts({ sort: "price_asc" });
    expect(asc.data.map((product) => product.price)).toEqual([
      "210000.00",
      "275000.00",
      "320000.00",
      "450000.00",
    ]);

    const desc = await getProducts({ sort: "price_desc" });
    expect(desc.data.map((product) => product.price)).toEqual([
      "450000.00",
      "320000.00",
      "275000.00",
      "210000.00",
    ]);
  });

  it("combines category, sort and pagination in one request", async () => {
    const result = await getProducts({
      categoryId: 3,
      sort: "price_asc",
      perPage: 1,
      page: 2,
    });

    expect(result.data.map((product) => product.id)).toEqual([14]);
    expect(result.total).toBe(2);
    expect(result.last_page).toBe(2);
  });

  it("filters by search term", async () => {
    const result = await getProducts({ search: "elitebook" });

    expect(result.data.map((product) => product.id)).toEqual([14]);
  });

  it("returns an empty page for a category with no products", async () => {
    const result = await getProducts({ categoryId: 4 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
  });

  it("keeps the fixture honest: every product is published except the prototype", () => {
    expect(testProducts.filter((product) => !product.is_published)).toHaveLength(1);
  });

  it("mirrors Laravel: a page beyond the last page returns [] with the REAL current_page and last_page", async () => {
    const result = await getProducts({ page: 99 });

    expect(result.data).toEqual([]);
    expect(result.current_page).toBe(99);
    expect(result.last_page).toBe(1);
    expect(result.total).toBe(4);
    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
  });
});

describe("review-showcase handler", () => {
  it("returns the review_showcase_items envelope", async () => {
    const result = await getReviewShowcase();

    expect(callCounts.reviewShowcase).toBe(1);
    expect(result.review_showcase_items.data).toHaveLength(1);
    expect(result.review_showcase_items.data[0].caption).toBe("My new setup");
    expect(result.review_showcase_items.data[0].asset.path).toBe(
      "reviews/setup.jpg",
    );
  });

  it("omits page when the caller does not provide one", async () => {
    await getReviewShowcase();

    expect(reviewShowcaseRequests[0].params.has("page")).toBe(false);
  });

  it("sends page as a query param when provided", async () => {
    const result = await getReviewShowcase(1);

    expect(reviewShowcaseRequests[0].params.get("page")).toBe("1");
    expect(result.review_showcase_items.current_page).toBe(1);
  });
});

describe("services handler", () => {
  it("serves the paginated envelope from the configured pool", async () => {
    setServicesListSource(testServices);

    const result = await getServices();

    expect(servicesListRequests[0].params.has("page")).toBe(false);
    expect(result.data).toHaveLength(4);
    expect(result.total).toBe(4);
    expect(result.current_page).toBe(1);
    expect(result.last_page).toBe(1);
  });

  it("mirrors Laravel: an out-of-range page returns [] with the REAL current_page and last_page", async () => {
    setServicesListSource(testServices);

    const result = await getServices(99);

    expect(result.data).toEqual([]);
    expect(result.current_page).toBe(99);
    expect(result.last_page).toBe(1);
    expect(result.total).toBe(4);
    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
  });
});

describe("shipping-fee handler", () => {
  it("returns the flat fee as a single money-string field", async () => {
    const result = await getShippingFee();

    expect(callCounts.shippingFee).toBe(1);
    expect(result).toEqual({ shipping_fee: "200.00" });
  });

  it("serves the live configured fee so checkout renders the current value", async () => {
    setShippingFeeSource("999.00");

    const result = await getShippingFee();

    expect(result.shipping_fee).toBe("999.00");
  });
});
