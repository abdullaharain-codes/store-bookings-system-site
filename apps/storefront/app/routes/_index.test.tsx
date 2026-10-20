import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Brand,
  Category,
  HomepageBanner,
  Product,
  Service,
} from "@ecommerce/api-client";
import {
  BANNERS_URL,
  BRANDS_URL,
  CATEGORIES_URL,
  PRODUCTS_URL,
  SERVICES_URL,
  callCounts,
  productRequests,
  testBanners,
  testProducts,
} from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Home from "./_index";

/**
 * Home's taxonomy bands (TASK B2b2) and its three merchandising sections
 * (TASK B2c: hero overlay, New Arrivals, Featured).
 *
 * These tests render the real route against MSW, so they cover the band markup,
 * the Marquee/static-row threshold and the three states together. They assert on
 * roles and accessible names rather than class strings, because the bands must
 * stay usable if the reference styling is retuned.
 */

/** Mirrors the Category shape the api-client returns (timestamps optional). */
function makeCategory(
  id: number,
  overrides: Partial<Category> = {},
): Category {
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

function makeBrand(id: number, overrides: Partial<Brand> = {}): Brand {
  return {
    id,
    name: `Brand ${id}`,
    slug: `brand-${id}`,
    description: null,
    logo_asset_id: null,
    banner_asset_id: null,
    is_published: true,
    logo_asset: null,
    ...overrides,
  };
}

/** N top-level categories — the band shows these and nothing nested. */
function topLevelCategories(count: number): Category[] {
  return Array.from({ length: count }, (_, index) => makeCategory(index + 1));
}

/**
 * Per-test overrides. Each still increments the shared call counter so it keeps
 * the same meaning as the default handlers ("how many times has the page asked
 * for this resource"), which is what the retry assertions below rely on.
 */
function useCategories(categories: Category[]) {
  server.use(
    http.get(CATEGORIES_URL, () => {
      callCounts.categories += 1;
      return HttpResponse.json({ categories });
    }),
  );
}

function useBrands(brands: Brand[]) {
  server.use(
    http.get(BRANDS_URL, () => {
      callCounts.brands += 1;
      return HttpResponse.json({ brands });
    }),
  );
}

/**
 * Hero banners are deliberately NOT in the default handler (the default returns
 * none, so the hero stays out of every unrelated page test), so a hero test has
 * to opt in the same way a real load would.
 */
function useBanners(banners: HomepageBanner[]) {
  server.use(
    http.get(BANNERS_URL, () => {
      callCounts.banners += 1;
      return HttpResponse.json({ banners });
    }),
  );
}

/** The paginated envelope ProductController sends (only `data` is read here). */
function productsResponse(products: Product[]) {
  return HttpResponse.json({
    data: products,
    links: [],
    current_page: 1,
    last_page: 1,
    per_page: products.length || 15,
    total: products.length,
    from: products.length ? 1 : null,
    to: products.length || null,
  });
}

function useProducts(products: Product[]) {
  server.use(
    http.get(PRODUCTS_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      callCounts.products += 1;
      productRequests.push({ params });
      // Mirror the server's featured filter so a `featured=1` override only
      // hands back featured rows — otherwise a "nothing is featured" assertion
      // would be testing a server that ignores the flag it was sent.
      const featured = params.get("featured");
      if (featured !== null && featured !== "") {
        const wantFeatured = featured === "1" || featured === "true";
        return productsResponse(
          products.filter((product) => product.is_featured === wantFeatured),
        );
      }
      return productsResponse(products);
    }),
  );
}

function makeService(id: number, overrides: Partial<Service> = {}): Service {
  return {
    id,
    name: `Service ${id}`,
    slug: `service-${id}`,
    description: null,
    price_min: "1000.00",
    price_max: "5000.00",
    duration_minutes: 60,
    is_published: true,
    ...overrides,
  };
}

function useServices(services: Service[]) {
  server.use(
    http.get(SERVICES_URL, () =>
      HttpResponse.json({
        data: services,
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: services.length,
        from: services.length ? 1 : null,
        to: services.length || null,
      }),
    ),
  );
}

const HERO_REGION = "Featured banners";
const NEW_ARRIVALS_HEADING = "New Arrivals";
const FEATURED_HEADING = "Featured Products";
/**
 * The Featured carousel's own name (lowercase "products") is deliberately
 * distinct from the section heading it sits under, so a test can tell the
 * labelled <section> apart from the Carousel's role="region".
 */
const FEATURED_CAROUSEL = "Featured products";

/** The three B2c sections, fetched independently, so each is addressable. */
const heroRegion = () => screen.getByRole("region", { name: HERO_REGION });
const newArrivalsSection = () =>
  screen.getByRole("region", { name: NEW_ARRIVALS_HEADING });

/**
 * The band heading and the Marquee region deliberately share one accessible name
 * (design task: h2 + aria-labelledby on the section, Marquee ariaLabel = the
 * heading text). A labelled <section> and the Marquee both map to role=region, so
 * the count is the discriminator: 1 = static row, 2 = marquee present.
 */
function bandRegions(name: string): HTMLElement[] {
  return screen.queryAllByRole("region", { name });
}

const CATEGORY_HEADING = "Shop by Category";
const BRAND_HEADING = "Shop by Brands";

beforeEach(() => {
  // Marquee reads prefers-reduced-motion; jsdom does not implement matchMedia,
  // and a reduced-motion client renders a static strip with no pause control,
  // which would make the threshold assertions below pass for the wrong reason.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

describe("home Shop by Category band", () => {
  it("renders API categories as real links to their listing pages", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(2, { name: "Accessories", slug: "accessories" }),
    ]);

    renderWithProviders(<Home />);

    const link = await screen.findByRole("link", { name: "Laptops" });
    expect(link).toHaveAttribute("href", "/shop/category/laptops");
    expect(
      screen.getByRole("link", { name: "Accessories" })
    ).toHaveAttribute("href", "/shop/category/accessories");
  });

  it("shows top-level categories only and never nests a subcategory", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(2, {
        name: "Gaming Laptops",
        slug: "gaming-laptops",
        parent_category_id: 1,
      }),
    ]);

    renderWithProviders(<Home />);

    expect(await screen.findByRole("link", { name: "Laptops" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Gaming Laptops" })
    ).not.toBeInTheDocument();
  });

  it("labels the section from its heading", async () => {
    useCategories(topLevelCategories(3));

    renderWithProviders(<Home />);

    const heading = await screen.findByRole("heading", {
      name: CATEGORY_HEADING,
      level: 2,
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("becomes a marquee region once there are enough items", async () => {
    useCategories(topLevelCategories(6));

    renderWithProviders(<Home />);

    await screen.findByRole("link", { name: "Category 1" });
    expect(bandRegions(CATEGORY_HEADING)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /pause scrolling/i })
    ).toBeInTheDocument();
  });

  it("stays a static row below the threshold, with no motion or pause control", async () => {
    useCategories(topLevelCategories(5));

    renderWithProviders(<Home />);

    expect(await screen.findByRole("link", { name: "Category 1" })).toBeVisible();
    expect(bandRegions(CATEGORY_HEADING)).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /pause scrolling/i })
    ).not.toBeInTheDocument();
    // Static row still links every item.
    expect(screen.getByRole("link", { name: "Category 5" })).toBeVisible();
  });

  it("omits the whole section when no categories are published", async () => {
    useCategories([]);

    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(callCounts.categories).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("heading", { name: CATEGORY_HEADING })
    ).not.toBeInTheDocument();
    expect(bandRegions(CATEGORY_HEADING)).toHaveLength(0);
  });

  it("shows an error state and refetches on retry", async () => {
    let attempt = 0;
    server.use(
      http.get(CATEGORIES_URL, () => {
        attempt += 1;
        callCounts.categories += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { message: "boom" },
            { status: 500 },
          );
        }
        return HttpResponse.json({ categories: topLevelCategories(2) });
      }),
    );

    renderWithProviders(<Home />);

    expect(
      await screen.findByRole("heading", { name: "Categories unavailable" })
    ).toBeInTheDocument();

    const before = callCounts.categories;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("link", { name: "Category 1" })).toBeVisible();
    expect(callCounts.categories).toBeGreaterThan(before);
  });
});

describe("home Shop by Brands band", () => {
  it("renders every returned brand as a real link", async () => {
    useBrands([
      makeBrand(1, { name: "Dell", slug: "dell" }),
      makeBrand(2, { name: "HP", slug: "hp" }),
      makeBrand(3, { name: "Lenovo", slug: "lenovo" }),
    ]);

    renderWithProviders(<Home />);

    expect(await screen.findByRole("link", { name: "Dell" })).toHaveAttribute(
      "href",
      "/shop/brand/dell",
    );
    expect(screen.getByRole("link", { name: "HP" })).toHaveAttribute(
      "href",
      "/shop/brand/hp",
    );
    expect(screen.getByRole("link", { name: "Lenovo" })).toHaveAttribute(
      "href",
      "/shop/brand/lenovo",
    );
  });

  it("becomes a marquee region once there are enough items", async () => {
    useBrands(topLevelBrands(6));

    renderWithProviders(<Home />);

    await screen.findByRole("link", { name: "Brand 1" });
    expect(bandRegions(BRAND_HEADING)).toHaveLength(2);
  });

  it("stays a static row below the threshold, with no motion or pause control", async () => {
    useBrands(topLevelBrands(3));

    renderWithProviders(<Home />);

    expect(await screen.findByRole("link", { name: "Brand 1" })).toBeVisible();
    expect(bandRegions(BRAND_HEADING)).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /pause scrolling/i })
    ).not.toBeInTheDocument();
  });

  it("omits the whole section when no brands are published", async () => {
    useBrands([]);

    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(callCounts.brands).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("heading", { name: BRAND_HEADING })
    ).not.toBeInTheDocument();
  });
});

/** N brands — every returned brand shows, unlike categories. */
function topLevelBrands(count: number): Brand[] {
  return Array.from({ length: count }, (_, index) => makeBrand(index + 1));
}

describe("home hero banners", () => {
  it("shows the overlay headline and subtitle as plain paragraphs, not headings", async () => {
    useBanners(testBanners);

    renderWithProviders(<Home />);

    const hero = await screen.findByRole("region", { name: HERO_REGION });

    // PRD §8: headline and subtitle are plain copy. Making either a heading
    // would stack h2s above the section headings or fight the single page h1.
    expect(within(hero).getByText("Summer laptop sale")).toBeInTheDocument();
    expect(within(hero).getByText("Up to 40% off selected models.")).toBeInTheDocument();
    expect(within(hero).queryByRole("heading")).toBeNull();
    expect(within(hero).getByText("Summer laptop sale").tagName).toBe("P");
  });

  it("omits the overlay for an image-only banner rather than rendering it empty", async () => {
    useBanners([testBanners[1]]);

    renderWithProviders(<Home />);

    const hero = await screen.findByRole("region", { name: HERO_REGION });
    expect(within(hero).queryByText(/sale/i)).not.toBeInTheDocument();
    // No empty overlay card either: the caption block is the only child besides
    // the "Shop Accessories" pill. An always-rendered-but-empty card would
    // leave a second child here.
    const pill = within(hero).getByText("Shop Accessories");
    expect(pill.parentElement?.children).toHaveLength(1);
  });

  it("links each slide to its target category page", async () => {
    useBanners(testBanners);

    renderWithProviders(<Home />);

    const hero = await screen.findByRole("region", { name: HERO_REGION });
    // Only the active slide is an anchor (the others are decorative divs).
    expect(within(hero).getByRole("link")).toHaveAttribute(
      "href",
      "/shop/category/laptops",
    );
  });

  it("loads the first slide eagerly at high priority and the later ones lazily", async () => {
    useBanners(testBanners);

    renderWithProviders(<Home />);

    const hero = await screen.findByRole("region", { name: HERO_REGION });
    const first = within(hero).getByRole("group", { name: "Slide 1 of 2" });
    const second = within(hero).getByRole("group", { name: "Slide 2 of 2" });

    // The image is deliberately decorative (alt=""), so it is not exposed as a
    // role=img — query the markup for the loading attributes.
    const firstImg = first.querySelector("img") as HTMLImageElement;
    expect(firstImg).not.toBeNull();
    expect(firstImg).toHaveAttribute("loading", "eager");
    expect(firstImg).toHaveAttribute("fetchpriority", "high");

    const secondImg = second.querySelector("img") as HTMLImageElement;
    expect(secondImg).not.toBeNull();
    expect(secondImg).toHaveAttribute("loading", "lazy");
    expect(secondImg).toHaveAttribute("fetchpriority", "auto");
  });

  it("omits the hero entirely when nothing is published", async () => {
    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(callCounts.banners).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("region", { name: HERO_REGION })).not.toBeInTheDocument();
  });
});

describe("home New Arrivals", () => {
  it("requests the newest products, eight per page", async () => {
    renderWithProviders(<Home />);

    await screen.findByRole("heading", { name: NEW_ARRIVALS_HEADING });

    const request = productRequests.find((r) => r.params.get("sort") === "newest");
    expect(request).toBeDefined();
    expect(request!.params.get("per_page")).toBe("8");
    // The New Arrivals row never asks for featured; that is the Featured row's
    // job, and the two must not share one cache entry.
    expect(request!.params.get("featured")).toBeNull();
  });

  it("links every product to its detail page and offers View all", async () => {
    renderWithProviders(<Home />);

    const section = await screen.findByRole("region", { name: NEW_ARRIVALS_HEADING });
    // The card's title link announces as "Brand Product", so name the anchor by
    // its product suffix rather than the exact string.
    expect(
      within(section).getByRole("link", { name: /Dell XPS 15$/ }),
    ).toHaveAttribute("href", "/product/dell-xps-15");
    expect(
      within(section).getByRole("link", { name: /HP EliteBook 840$/ }),
    ).toHaveAttribute("href", "/product/hp-elitebook-840");
    expect(within(section).getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/shop",
    );
  });

  it("omits the section when there are no products at all", async () => {
    useProducts([]);

    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(callCounts.products).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("heading", { name: NEW_ARRIVALS_HEADING }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: FEATURED_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("shows an error state and refetches on retry", async () => {
    let shouldFail = true;
    server.use(
      http.get(PRODUCTS_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;
        callCounts.products += 1;
        productRequests.push({ params });
        if (params.get("sort") === "newest" && shouldFail) {
          shouldFail = false;
          return HttpResponse.json({ message: "boom" }, { status: 500 });
        }
        return productsResponse(testProducts.filter((p) => p.is_published));
      }),
    );

    renderWithProviders(<Home />);

    expect(
      await screen.findByRole("heading", { name: "New arrivals unavailable" }),
    ).toBeInTheDocument();

    const before = callCounts.products;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("heading", { name: NEW_ARRIVALS_HEADING })).toBeVisible();
    expect(callCounts.products).toBeGreaterThan(before);
  });
});

describe("home Featured Products", () => {
  it("requests only featured products, eight per page", async () => {
    renderWithProviders(<Home />);

    await screen.findByRole("region", { name: FEATURED_CAROUSEL });

    const request = productRequests.find((r) => r.params.get("featured") !== null);
    expect(request).toBeDefined();
    expect(request!.params.get("featured")).toBe("1");
    expect(request!.params.get("per_page")).toBe("8");
    expect(request!.params.get("sort")).toBeNull();
  });

  it("renders only featured, published products and nothing else", async () => {
    renderWithProviders(<Home />);

    const carousel = await screen.findByRole("region", { name: FEATURED_CAROUSEL });
    // featured + published fixture products (ids 11 and 13)...
    expect(within(carousel).getByRole("heading", { name: "Dell XPS 15" })).toBeInTheDocument();
    expect(
      within(carousel).getByRole("link", { name: /Dell XPS 15$/ }),
    ).toHaveAttribute("href", "/product/dell-xps-15");
    expect(
      within(carousel).getByRole("heading", { name: "Dell Latitude 5440" }),
    ).toBeInTheDocument();
    // ...published but NOT featured (ids 12 and 14) stay out of the carousel...
    expect(
      within(carousel).queryByRole("heading", { name: "HP Spectre x360" }),
    ).not.toBeInTheDocument();
    expect(
      within(carousel).queryByRole("heading", { name: "HP EliteBook 840" }),
    ).not.toBeInTheDocument();
    // ...the featured-but-unpublished row never appears anywhere.
    expect(screen.queryByText("Unpublished Prototype")).not.toBeInTheDocument();
    // The filter is doing the work: those non-featured products are still on
    // the page, in the New Arrivals grid (await it — the two rows load
    // independently).
    await screen.findByRole("heading", { name: NEW_ARRIVALS_HEADING });
    expect(
      within(newArrivalsSection()).getByRole("heading", { name: "HP Spectre x360" }),
    ).toBeInTheDocument();
  });

  it("omits the section when nothing is featured", async () => {
    useProducts(testProducts.filter((p) => p.is_published && !p.is_featured));

    renderWithProviders(<Home />);

    await screen.findByRole("heading", { name: NEW_ARRIVALS_HEADING });
    expect(
      screen.queryByRole("heading", { name: FEATURED_HEADING }),
    ).not.toBeInTheDocument();
  });

  it("groups five products into two slides of four and one", async () => {
    const five: Product[] = Array.from({ length: 5 }, (_, i) => ({
      // Copy the published fixture shape so the card has valid fields...
      ...testProducts[i % 4],
      id: 101 + i,
      name: `Featured ${i + 1}`,
      slug: `featured-${i + 1}`,
      sku: `FTRD-${i + 1}`,
      is_featured: true,
      is_published: true,
    }));
    useProducts(five);

    renderWithProviders(<Home />);

    const carousel = await screen.findByRole("region", { name: FEATURED_CAROUSEL });
    const slides = within(carousel).getAllByRole("group", { name: /Slide \d of 2/ });
    expect(slides).toHaveLength(2);

    // Slide one is a full row of four cards; the fifth rides in slide two.
    expect(
      within(slides[0]).getAllByRole("heading", { name: /^Featured [1-4]$/ }),
    ).toHaveLength(4);
    expect(within(slides[1]).getByRole("heading", { name: "Featured 5" })).toBeInTheDocument();
    expect(
      within(slides[1]).getByRole("link", { name: /Featured 5$/ }),
    ).toHaveAttribute("href", "/product/featured-5");
  });

  it("shows an error state and refetches on retry", async () => {
    let shouldFail = true;
    server.use(
      http.get(PRODUCTS_URL, ({ request }) => {
        const params = new URL(request.url).searchParams;
        callCounts.products += 1;
        productRequests.push({ params });
        if (params.get("featured") !== null && shouldFail) {
          shouldFail = false;
          return HttpResponse.json({ message: "boom" }, { status: 500 });
        }
        return productsResponse(testProducts.filter((p) => p.is_published));
      }),
    );

    renderWithProviders(<Home />);

    expect(
      await screen.findByRole("heading", { name: "Featured products unavailable" }),
    ).toBeInTheDocument();

    const before = callCounts.products;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("region", { name: FEATURED_CAROUSEL })).toBeVisible();
    expect(callCounts.products).toBeGreaterThan(before);
  });
});

describe("home merchandising loading states", () => {
  it("skeletonizes the hero, New Arrivals and Featured while requests are in flight", async () => {
    server.use(
      http.get(BANNERS_URL, () => new Promise(() => {})),
      http.get(PRODUCTS_URL, () => new Promise(() => {})),
    );

    renderWithProviders(<Home />);

    expect(
      await screen.findByRole("status", { name: "Loading featured banners" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading new arrivals" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading featured products" }),
    ).toBeInTheDocument();
  });
});

describe("home page structure", () => {
  it("keeps exactly one h1 with every section populated", async () => {
    useCategories([
      makeCategory(1, { name: "Laptops", slug: "laptops" }),
      makeCategory(2, { name: "Accessories", slug: "accessories" }),
    ]);
    useBrands([makeBrand(1, { name: "Dell", slug: "dell" })]);
    useBanners(testBanners);
    useServices([makeService(1)]);

    const { container } = renderWithProviders(<Home />);

    await screen.findByRole("heading", { name: CATEGORY_HEADING, level: 2 });
    await screen.findByRole("heading", { name: BRAND_HEADING, level: 2 });
    await screen.findByRole("heading", { name: NEW_ARRIVALS_HEADING, level: 2 });
    await screen.findByRole("heading", { name: FEATURED_HEADING, level: 2 });
    await screen.findByRole("heading", { name: "Popular Services", level: 2 });
    await screen.findByRole("region", { name: HERO_REGION });

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(within(heroRegion()).queryByRole("heading")).toBeNull();
  });

  it("does not duplicate ids when a band is a marquee", async () => {
    useCategories(topLevelCategories(6));

    const { container } = renderWithProviders(<Home />);

    await screen.findByRole("link", { name: "Category 1" });
    // Marquee renders children twice (real + aria-hidden decoration copy);
    // duplicate ids would be invalid HTML and break aria-labelledby.
    const ids = Array.from(container.querySelectorAll("[id]")).map(
      (node) => node.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("home Popular Services band", () => {
  it("renders at most the first 3 services, in API order", async () => {
    useServices([
      makeService(1, { name: "Laptop Repair", slug: "laptop-repair" }),
      makeService(2, { name: "Virus Removal", slug: "virus-removal" }),
      makeService(3, { name: "Data Recovery", slug: "data-recovery" }),
      makeService(4, { name: "Network Setup", slug: "network-setup" }),
      makeService(5, { name: "PC Build", slug: "pc-build" }),
    ]);

    renderWithProviders(<Home />);

    const servicesRegion = await screen.findByRole("region", {
      name: "Popular Services",
    });
    expect(
      within(servicesRegion)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Laptop Repair", "Virus Removal", "Data Recovery"]);
    expect(
      within(servicesRegion).queryByRole("heading", { name: "Network Setup" }),
    ).not.toBeInTheDocument();
    expect(
      within(servicesRegion).queryByRole("heading", { name: "PC Build" }),
    ).not.toBeInTheDocument();
  });

  it("renders each card's details area as a real link to /service/{slug}", async () => {
    useServices([
      makeService(1, { name: "Laptop Repair", slug: "laptop-repair" }),
      makeService(2, { name: "Virus Removal", slug: "virus-removal" }),
      makeService(3, { name: "Data Recovery", slug: "data-recovery" }),
    ]);

    renderWithProviders(<Home />);

    const servicesRegion = await screen.findByRole("region", {
      name: "Popular Services",
    });
    expect(
      within(servicesRegion)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/service/laptop-repair",
      "/service/virus-removal",
      "/service/data-recovery",
    ]);
  });

  it("shows a loading skeleton while services are pending", async () => {
    server.use(http.get(SERVICES_URL, () => new Promise(() => {})));

    renderWithProviders(<Home />);

    expect(
      await screen.findByRole("status", { name: "Loading services" }),
    ).toBeInTheDocument();
  });

  it("shows an error with retry when services fail, and recovers", async () => {
    let attempts = 0;
    server.use(
      http.get(SERVICES_URL, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ message: "boom" }, { status: 500 });
        }
        return HttpResponse.json({
          data: [makeService(1)],
          current_page: 1,
          last_page: 1,
          per_page: 15,
          total: 1,
          from: 1,
          to: 1,
        });
      }),
    );

    renderWithProviders(<Home />);

    expect(
      await screen.findByRole("heading", { name: "Services unavailable" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(
      await screen.findByRole("heading", { name: "Service 1" }),
    ).toBeVisible();
  });

  it("omits the entire section when the API returns no services", async () => {
    let calls = 0;
    server.use(
      http.get(SERVICES_URL, () => {
        calls += 1;
        return HttpResponse.json({
          data: [],
          current_page: 1,
          last_page: 1,
          per_page: 15,
          total: 0,
          from: null,
          to: null,
        });
      }),
    );

    renderWithProviders(<Home />);

    // The emptiness decision is made with the answer in hand: wait until the
    // request went over the wire and every loading status cleared, then assert
    // the section is absent.
    await waitFor(() => {
      expect(calls).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("status", { name: "Loading services" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { name: "Popular Services" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Popular Services" }),
    ).not.toBeInTheDocument();
  });
});

describe("home Customer Reviews showcase", () => {
  it("renders after Popular Services as the page's last section", async () => {
    useServices([makeService(1)]);

    renderWithProviders(<Home />);

    const popularRegion = await screen.findByRole("region", {
      name: "Popular Services",
    });
    const reviewsRegion = await screen.findByRole("region", {
      name: "Customer reviews",
    });
    expect(
      popularRegion.compareDocumentPosition(reviewsRegion) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("fetches the review showcase exactly once on render", async () => {
    renderWithProviders(<Home />);

    await screen.findByRole("heading", { name: "What Our Customers Say" });

    expect(callCounts.reviewShowcase).toBe(1);
  });
});