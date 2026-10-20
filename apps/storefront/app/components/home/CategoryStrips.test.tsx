import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Category, Product } from "@ecommerce/api-client";
import {
  CATEGORIES_URL,
  PRODUCTS_URL,
  callCounts,
  productRequests,
} from "../../test/handlers";
import { server } from "../../test/server";
import { createTestQueryClient, renderWithProviders } from "../../test/utils";
import { queryKeys } from "../../hooks/query-keys";
import { CategoryStrips } from "./CategoryStrips";

/**
 * TASK B2d-1: the Home "category strips" block. Renders up to four strips, one
 * per published TOP-LEVEL category, in the API's order, each asking the
 * products endpoint for that category's scope at per_page 4 (plain grid, NOT a
 * carousel). A strip with no products is hidden entirely; with none remaining
 * the whole block is absent.
 *
 * These tests render the component in isolation against MSW so each strip's
 * request is observable through the shared `productRequests` recorder and the
 * strips' placement on the Home page is covered by `_index.test.tsx`.
 */

/** Mirrors the Category shape the api-client returns (timestamps optional). */
function makeCategory(id: number, overrides: Partial<Category> = {}): Category {
  return {
    id,
    name: `Category ${id}`,
    slug: `category-${id}`,
    description: null,
    display_order: id,
    is_published: true,
    parent_category_id: null,
    logo_asset: null,
    banner_asset: null,
    ...overrides,
  };
}

function makeProduct(id: number, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    sku: `SKU-${id}`,
    description: null,
    price: "10000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 3,
    brand_id: null,
    is_published: true,
    is_featured: false,
    brand: null,
    categories: [],
    images: [],
    ...overrides,
  };
}

/** The paginated envelope ProductController sends (only `data` is read here). */
function productsResponse(products: Product[]) {
  return HttpResponse.json({
    data: products,
    links: [],
    current_page: 1,
    last_page: 1,
    per_page: products.length || 4,
    total: products.length,
    from: products.length ? 1 : null,
    to: products.length || null,
  });
}

function useCategories(categories: Category[]) {
  server.use(http.get(CATEGORIES_URL, () => HttpResponse.json({ categories })));
}

/**
 * One products handler for all strip tests. Requests are recorded so a test
 * can prove what the client actually sent per strip; each top-level category
 * is answered from its own slice of the fixture.
 */
function useProductsByCategory(byCategory: Record<number, Product[]>) {
  server.use(
    http.get(PRODUCTS_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      callCounts.products += 1;
      productRequests.push({ params });
      const categoryId = Number(params.get("category_id"));
      return productsResponse(byCategory[categoryId] ?? []);
    }),
  );
}

describe("home category strips", () => {
  it("renders strips only for top-level categories, at most four, in API order", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops", display_order: 1 }),
      makeCategory(2, {
        name: "Gaming Laptops",
        slug: "gaming-laptops",
        display_order: 1,
        parent_category_id: 1,
      }),
      makeCategory(3, { name: "Accessories", slug: "accessories", display_order: 2 }),
      makeCategory(4, {
        name: "Peripherals",
        slug: "peripherals",
        display_order: 1,
        parent_category_id: 3,
      }),
      makeCategory(5, { name: "Components", slug: "components", display_order: 3 }),
      makeCategory(6, { name: "Networking", slug: "networking", display_order: 4 }),
      makeCategory(7, { name: "Monitors", slug: "monitors", display_order: 5 }),
    ]);
    // Every strip that renders needs at least one product; the fifth
    // top-level (Monitors) is sliced away before its query could fire.
    useProductsByCategory({
      1: [makeProduct(11)],
      3: [makeProduct(31)],
      5: [makeProduct(51)],
      6: [makeProduct(61)],
    });

    renderWithProviders(<CategoryStrips />);

    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Laptops",
      "Accessories",
      "Components",
      "Networking",
    ]);

    // Subcategories never get a strip of their own.
    expect(
      screen.queryByRole("heading", { name: "Gaming Laptops" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Peripherals" }),
    ).not.toBeInTheDocument();

    // Max four strips: the fifth top-level receives no products request at all.
    expect(
      screen.queryByRole("heading", { name: "Monitors" }),
    ).not.toBeInTheDocument();
    expect(
      productRequests.some((request) => request.params.get("category_id") === "7"),
    ).toBe(false);
  });

  it("requests four products per strip, filtered by that strip's category id", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(4, { name: "Accessories", slug: "accessories" }),
    ]);
    useProductsByCategory({
      1: [makeProduct(11), makeProduct(12)],
      4: [],
    });

    renderWithProviders(<CategoryStrips />);

    expect(await screen.findByRole("heading", { name: "Laptops" })).toBeVisible();

    // Both strips' requests go over the wire independently; wait until each is
    // recorded before reading their params back.
    await waitFor(() => {
      expect(
        productRequests.some((request) => request.params.get("category_id") === "1"),
      ).toBe(true);
      expect(
        productRequests.some((request) => request.params.get("category_id") === "4"),
      ).toBe(true);
    });

    // An empty strip still asks: hiding it is a render decision made with the
    // answer in hand, so the Accessories request proves the per-strip wiring.
    const laptopRequest = productRequests.find(
      (request) => request.params.get("category_id") === "1",
    );
    const accessoryRequest = productRequests.find(
      (request) => request.params.get("category_id") === "4",
    );
    expect(laptopRequest).toBeDefined();
    expect(accessoryRequest).toBeDefined();
    expect(laptopRequest!.params.get("per_page")).toBe("4");
    expect(accessoryRequest!.params.get("per_page")).toBe("4");
    expect(laptopRequest!.params.get("page")).toBeNull();
  });

  it("hides an empty strip and drops the whole block when nothing remains", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(4, { name: "Accessories", slug: "accessories" }),
    ]);
    useProductsByCategory({ 1: [makeProduct(11)], 4: [] });

    const first = renderWithProviders(<CategoryStrips />);

    expect(await first.findByRole("heading", { name: "Laptops" })).toBeVisible();
    // Accessories published but with no products: whole strip (heading too) is gone.
    expect(
      screen.queryByRole("heading", { name: "Accessories" }),
    ).not.toBeInTheDocument();

    // Every strip empty -> the whole block is absent from the document.
    first.unmount();
    useCategories([makeCategory(8, { name: "Empty", slug: "empty" })]);
    useProductsByCategory({});

    renderWithProviders(<CategoryStrips />);

    // The "Empty" strip's request already fired, but that alone is nothing:
    // the emptiness decision happens only once its response lands. Wait for
    // every loading skeleton to disappear, THEN assert the strip and the
    // whole block are gone.
    await waitFor(() => {
      expect(screen.queryAllByRole("status")).toHaveLength(0);
    });
    expect(
      screen.queryByRole("heading", { name: "Empty" }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });

  it("links View all and every product to real hrefs", async () => {
    useCategories([makeCategory(1, { name: "Laptops", slug: "laptops" })]);
    useProductsByCategory({
      1: [
        makeProduct(11, { name: "Dell XPS 15", slug: "dell-xps-15" }),
        makeProduct(12, { name: "HP Spectre x360", slug: "hp-spectre-x360" }),
      ],
    });

    renderWithProviders(<CategoryStrips />);

    const section = await screen.findByRole("region", { name: "Laptops" });
    expect(within(section).getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/shop/category/laptops",
    );
    expect(
      within(section).getByRole("link", { name: /Dell XPS 15$/ }),
    ).toHaveAttribute("href", "/product/dell-xps-15");
    expect(
      within(section).getByRole("link", { name: /HP Spectre x360$/ }),
    ).toHaveAttribute("href", "/product/hp-spectre-x360");
  });

  it("skeletonizes each strip while its products load", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(3, { name: "Components", slug: "components" }),
    ]);
    server.use(http.get(PRODUCTS_URL, () => new Promise(() => {})));

    renderWithProviders(<CategoryStrips />);

    expect(
      await screen.findByRole("status", { name: "Loading Laptops products" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading Components products" }),
    ).toBeInTheDocument();
  });

  it("shows a per-strip error state and retries just that strip", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(3, { name: "Components", slug: "components" }),
    ]);
    let laptopAttempts = 0;
    server.use(
      http.get(PRODUCTS_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;
        callCounts.products += 1;
        productRequests.push({ params });
        if (params.get("category_id") === "1") {
          laptopAttempts += 1;
          if (laptopAttempts === 1) {
            return HttpResponse.json({ message: "boom" }, { status: 500 });
          }
          return productsResponse([
            makeProduct(11, { name: "Dell XPS 15", slug: "dell-xps-15" }),
          ]);
        }
        return productsResponse([
          makeProduct(12, { name: "HP Spectre x360", slug: "hp-spectre-x360" }),
        ]);
      }),
    );

    renderWithProviders(<CategoryStrips />);

    // One strip fails while its neighbour renders normally.
    expect(
      await screen.findByRole("heading", { name: "Laptops products unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Dell XPS 15" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "HP Spectre x360" }),
    ).toBeInTheDocument();

    const before = callCounts.products;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(
      await screen.findByRole("heading", { name: "Dell XPS 15" }),
    ).toBeInTheDocument();
    expect(callCounts.products).toBeGreaterThan(before);
  });

  it("renders a new strip as soon as the API publishes a new top-level category", async () => {
    useCategories([makeCategory(1, { name: "Laptops", slug: "laptops" })]);
    useProductsByCategory({ 1: [makeProduct(11)] });

    const first = renderWithProviders(<CategoryStrips />);
    expect(await first.findByRole("heading", { name: "Laptops" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Accessories" }),
    ).not.toBeInTheDocument();

    first.unmount();

    // The mock now publishes a second top-level category; the component just
    // re-reads the API response - no code change involved.
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(4, { name: "Accessories", slug: "accessories" }),
    ]);
    useProductsByCategory({ 1: [makeProduct(11)], 4: [makeProduct(41)] });

    renderWithProviders(<CategoryStrips />);
    expect(await screen.findByRole("heading", { name: "Laptops" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Accessories" })).toBeVisible();
  });

  it("renders nothing at all when the shared categories query fails", async () => {
    server.use(
      http.get(CATEGORIES_URL, () => {
        callCounts.categories += 1;
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      }),
    );

    const queryClient = createTestQueryClient();
    renderWithProviders(<CategoryStrips />, { queryClient });

    // The "Shop by Category" band owns the shared categories error state, so
    // wait for the query to genuinely reach its error status, then assert the
    // block contributes nothing: no skeleton, no heading, no region, and no
    // strip product request (topLevel is empty while errored).
    await waitFor(() => {
      expect(queryClient.getQueryState(queryKeys.categories)?.status).toBe("error");
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(productRequests).toHaveLength(0);
  });
});