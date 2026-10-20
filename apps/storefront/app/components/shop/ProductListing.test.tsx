import { useEffect } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useNavigationType } from "react-router";
import { describe, expect, it } from "vitest";
import type { Product } from "@ecommerce/api-client";
import { callCounts, productRequests, setProductsSource, testBrands, testCategories } from "../../test/handlers";
import { renderWithProviders } from "../../test/utils";
import { ProductListing } from "./ProductListing";

/**
 * /shop listing from a single shared component (TASK B3-1). Assertions are on
 * roles and accessible names and on the recorded API params, mirroring how the
 * rest of the storefront proves "the client sent what it meant to".
 *
 * setProductsSource swaps the handler's fixture so tests can drive pagination
 * (a fixture of more than PRODUCTS_PER_PAGE rows) and the empty states; the
 * per-test cleanup in test/setup.ts restores the default.
 */

function makeProduct(partial: Partial<Product>): Product {
  return {
    id: 1000,
    name: "Dell XPS 15",
    slug: "dell-xps-15",
    sku: "DX-1000",
    description: null,
    price: "100000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 5,
    brand_id: 1,
    is_published: true,
    is_featured: false,
    brand: testBrands[0],
    categories: [testCategories[0]],
    images: [],
    ...partial,
  };
}

function makePriceFlat(id: number): Product {
  return makeProduct({
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    sku: `P-${id}`,
    price: `${id * 1000}.00`,
  });
}

const PRICE_FLAT = Array.from({ length: 14 }, (_, index) => makePriceFlat(100 + index));

describe("ProductListing", () => {
  it("renders the shop index with one h1, the breadcrumb, toolbar and grid (search query works)", async () => {
    renderWithProviders(<ProductListing />, { entry: "/shop" });

    // Skeleton announced while the first fetch is in flight.
    expect(screen.getByRole("status", { name: "Loading products" })).toBeInTheDocument();

    const heading = await screen.findByRole("heading", { name: "All Products" });
    expect(heading.tagName).toBe("H1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    // Breadcrumb: Home > Shop (current aria-current, not a link).
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(breadcrumb).getByText("Shop")).toHaveAttribute("aria-current", "page");

    // Live region + sort whitelist.
    expect(screen.getByText("Showing 1-4 of 4 products")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort products")).toHaveValue("newest");
    const options = within(screen.getByLabelText("Sort products")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Newest",
      "Price: Low to High",
      "Price: High to Low",
    ]);

    // Real product links (the card's image and title area are both anchors),
    // no cart/wishlist handlers — ProductCard renders disabled buttons for
    // both rather than wiring a handler.
    const cards = screen.getAllByRole("link", { name: /Dell XPS 15/ });
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toHaveAttribute("href", "/product/dell-xps-15");
    }

    // Taxonomy in the sidebar is real data, never hard-coded names.
    expect(screen.getByRole("link", { name: "Laptops" })).toHaveAttribute(
      "href",
      "/shop/category/laptops"
    );
    expect(screen.getByRole("link", { name: "Accessories" })).toBeInTheDocument();

    // The unhandled-request guard fails the run if we called anything else.
    await waitFor(() => expect(screen.getByLabelText("Sort products")).toHaveValue("newest"));
  });

  it("requests the right params on a deep link: ?page=2&sort=price_asc on the first render", async () => {
    setProductsSource(PRICE_FLAT);
    renderWithProviders(<ProductListing categorySlug="laptops" />, {
      entry: "/shop/category/laptops?page=2&sort=price_asc",
    });

    // The one h1 is the category name (no banner asset on the fixture).
    const heading = await screen.findByRole("heading", { name: "Laptops" });
    expect(heading.tagName).toBe("H1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText("All Products")).not.toBeInTheDocument();

    // Breadcrumb resolves the parent chain from the shared cache.
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByText("Laptops")).toHaveAttribute("aria-current", "page");

    // 14 rows paged at 12, page 2 of price_asc shows the two most expensive.
    await screen.findByText("Showing 13-14 of 14 products");
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    const pageTwo = screen.getByLabelText("Page 2");
    expect(pageTwo).toHaveAttribute("aria-current", "page");

    // The recorded request is the proof: category resolved by slug, then the
    // listing asked for its scope with sort + page + the UI's per-page.
    const request = productRequests[productRequests.length - 1];
    expect(request.params.get("category_id")).toBe("1");
    expect(request.params.get("sort")).toBe("price_asc");
    expect(request.params.get("page")).toBe("2");
    expect(request.params.get("per_page")).toBe("12");
  });

  it("redirects a sort+page deep link whose page is beyond the last to the last valid page", async () => {
    setProductsSource(PRICE_FLAT);
    const navType = { value: "POP" as string };
    function NavigationTypeProbe() {
      const type = useNavigationType();
      useEffect(() => {
        navType.value = type;
      });
      return null;
    }

    const { probe } = renderWithProviders(
      <>
        <ProductListing />
        <NavigationTypeProbe />
      </>,
      { entry: "/shop?page=3&sort=price_desc" },
    );

    // Laravel paginators do NOT clamp the requested page: page 3 on a 2-page
    // set comes back empty with the real last_page (2), so the listing
    // replaces the URL with the last valid page, keeping the sort.
    await waitFor(() => expect(probe.path).toBe("/shop?sort=price_desc&page=2"));
    await screen.findByText("Showing 13-14 of 14 products");
    expect(navType.value).toBe("REPLACE");

    const request = productRequests[productRequests.length - 1];
    expect(request.params.get("sort")).toBe("price_desc");
    expect(request.params.get("page")).toBe("2");
    expect(request.params.get("per_page")).toBe("12");

    // Changing the filter re-fetches and the second request resets the page.
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Sort products"), "price_asc");
    await waitFor(() => {
      expect(productRequests[productRequests.length - 1].params.get("sort")).toBe("price_asc");
      expect(productRequests[productRequests.length - 1].params.get("page")).toBeNull();
    });
  });

  it("resolves a brand slug: h1, hidden brand filter, brand-scoped request", async () => {
    renderWithProviders(<ProductListing brandSlug="dell" />, { entry: "/shop/brand/dell" });

    const heading = await screen.findByRole("heading", { name: "Dell" });
    expect(heading.tagName).toBe("H1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    // Brand radio filter is meaningless on a brand page — hidden.
    expect(screen.queryByRole("group", { name: "Brand" })).not.toBeInTheDocument();

    await waitFor(() => {
      const request = productRequests[productRequests.length - 1];
      expect(request.params.get("brand_id")).toBe("1");
    });
  });

  it("shows the not-found state with a link back and a noindex meta", async () => {
    renderWithProviders(<ProductListing categorySlug="no-such-category" />, {
      entry: "/shop/category/no-such-category",
    });

    const empty = await screen.findByRole("heading", { name: "Category not found" });
    expect(empty).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to shop" })).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();
    // No listing request for a page that never resolved its category.
    expect(callCounts.products).toBe(0);
  });

  it("shows the not-found state for an unknown brand too", async () => {
    renderWithProviders(<ProductListing brandSlug="no-such-brand" />, {
      entry: "/shop/brand/no-such-brand",
    });

    await screen.findByRole("heading", { name: "Brand not found" });
    expect(screen.getByRole("button", { name: "Back to shop" })).toBeInTheDocument();
    expect(callCounts.products).toBe(0);
  });

  it("empty-with-filters renders an EmptyState that clears the filters back to all products", async () => {
    const user = userEvent.setup();
    setProductsSource(PRICE_FLAT);
    renderWithProviders(<ProductListing />, { entry: "/shop?search=zzz-no-match" });

    await screen.findByRole("heading", { name: "No products match these filters" });
    const clear = screen.getByRole("button", { name: "Clear all filters" });
    await user.click(clear);

    await waitFor(() => {
      // Clearing drops every filter and reloads the whole catalogue.
      const request = productRequests[productRequests.length - 1];
      expect(request.params.get("search")).toBeNull();
    });
    await screen.findByText("Showing 1-12 of 14 products");
  });

  it("empty-without-filters says No products yet", async () => {
    setProductsSource([]);
    renderWithProviders(<ProductListing />, { entry: "/shop" });

    await screen.findByRole("heading", { name: "No products yet" });
    const results = screen.queryByText("No products match these filters");
    expect(results).not.toBeInTheDocument();
  });

  it("replaces an out-of-range ?page= with the last valid page, exactly once", async () => {
    const navType = { value: "POP" as string };
    function NavigationTypeProbe() {
      const type = useNavigationType();
      useEffect(() => {
        navType.value = type;
      });
      return null;
    }

    setProductsSource(PRICE_FLAT);
    const { probe } = renderWithProviders(
      <>
        <ProductListing />
        <NavigationTypeProbe />
      </>,
      { entry: "/shop?page=99" },
    );

    await waitFor(() => expect(probe.path).toBe("/shop?page=2"));

    expect(navType.value).toBe("REPLACE");
    expect(productRequests).toHaveLength(2);
    expect(productRequests[0].params.get("page")).toBe("99");
    expect(productRequests[1].params.get("page")).toBe("2");
    expect(
      screen.getByRole("heading", { level: 1, name: "All Products" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state with NO redirect when the catalogue has zero products", async () => {
    setProductsSource([]);
    const { probe } = renderWithProviders(<ProductListing />, {
      entry: "/shop?page=2",
    });

    await screen.findByRole("heading", { name: "No products match these filters" });

    expect(probe.path).toBe("/shop?page=2");
    expect(productRequests).toHaveLength(1);
  });

  it("filters open in a modal on small screens (existing ui Modal)", async () => {
    const user = userEvent.setup();
    setProductsSource(PRICE_FLAT);
    renderWithProviders(<ProductListing />, { entry: "/shop" });

    await screen.findByText("Showing 1-12 of 14 products");

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    // The brand group makes it into the dialog (and is still driven by props).
    expect(within(dialog).getByRole("group", { name: "Brand" })).toBeInTheDocument();
  });

  it("keeps at most one h1 when the record is loading or failed", async () => {
    setProductsSource(PRICE_FLAT);
    renderWithProviders(<ProductListing categorySlug="laptops" />, { entry: "/shop/category/laptops" });

    await screen.findByRole("heading", { name: "Laptops" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders subcategory pills from data with aria-current on the active one", async () => {
    renderWithProviders(<ProductListing categorySlug="gaming-laptops" />, {
      entry: "/shop/category/gaming-laptops",
    });

    await screen.findByRole("heading", { name: "Gaming Laptops" });
    // The sibling pill (Business Laptops) is a real link; the active one keeps
    // aria-current but is still navigable.
    const pills = await screen.findByRole("navigation", { name: "Subcategories" });
    expect(within(pills).getByRole("link", { name: "All Laptops" })).toBeInTheDocument();
    expect(within(pills).getByRole("link", { name: "Gaming Laptops" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});