import type { ReactElement, ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getBrands,
  getCategories,
  getHomepageBanners,
  getProducts,
  getServices,
  type HomepageBanner,
} from "@ecommerce/api-client";
import {
  BrandCard,
  Carousel,
  CategoryCard,
  ErrorState,
  LoadingSkeleton,
  Marquee,
  ServiceCard,
} from "@ecommerce/ui";
import { clsx } from "clsx";
import { CategoryStrips } from "../components/home/CategoryStrips";
import { ReviewShowcase } from "../components/home/ReviewShowcase";
import { ConnectedProductCard } from "../components/product/ConnectedProductCard";
import { queryKeys, TAXONOMY_STALE_TIME } from "../hooks/query-keys";

/**
 * Homepage (design.md §3.7 — §3.9): Hero Banner carousel → Shop by Category →
 * Shop by Brands → New Arrivals → Featured Products → Popular Services →
 * Customer Reviews showcase (frontend-plan.md). Section order follows the
 * reference layout.
 *
 * Deliberately loader-free: the route is prerendered, but every section is
 * admin-editable and must appear immediately on publish (PRD §13). Data is
 * fetched client-side, so the static HTML is a shell that hydrates live data —
 * each section owns its loading (skeleton), error (ErrorState + retry) and empty
 * states (design.md §3.9: sections with zero published items are omitted).
 *
 * Taxonomy is the exception: categories and brands go through the shared
 * `queryKeys` and stay cached for `TAXONOMY_STALE_TIME`, because the header nav
 * and these sections request the same two resources and must not refetch
 * independently on every visit.
 *
 * The single `h1` is the sr-only page title below. It deliberately does NOT
 * live in the hero: a banner headline is optional (BE1's image-only banner is
 * the common case), rotates every 6s across several slides, and only exists
 * after the client fetch — so an `h1` there would be absent from the prerendered
 * HTML, mutate mid-read, and disappear entirely when no banner is published.
 */
export function meta() {
  return [
    { title: "TechFix — Premium IT Products & Services" },
    {
      name: "description",
      content:
        "Premium laptops, components, accessories and on-site IT services for home and business, backed by real technicians.",
    },
  ];
}

export default function Home() {
  return (
    <>
      {/* The page's one and only h1 — see the note above on why it is not in the hero. */}
      <h1 className="sr-only">TechFix — Premium IT Products and Services</h1>
      <HomeHero />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-[var(--space-7)] px-[var(--space-6)] pb-[var(--space-8)] pt-[var(--space-7)]">
        <ShopByCategory />
        <ShopByBrand />
        <NewArrivals />
        <FeaturedProducts />
        <CategoryStrips />
        <PopularServices />
        <ReviewShowcase />
      </div>
    </>
  );
}

function SectionHeading({
  id,
  centered = false,
  children,
}: {
  id: string;
  centered?: boolean;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className={clsx(
        "font-[family-name:var(--font-family-display)] text-[length:var(--font-size-2xl)] font-semibold leading-tight text-[var(--color-text-primary)]",
        centered && "text-center",
      )}
    >
      {children}
    </h2>
  );
}

// Stand-in for section headings during loading, so the skeleton block visually
// matches the final layout without announcing a heading that may be omitted.
function SkeletonHeading() {
  return (
    <div
      aria-hidden="true"
      className="h-7 w-48 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
    />
  );
}

function HomeHero() {
  const navigate = useNavigate();
  const banners = useQuery({
    queryKey: ["homepage", "banners"],
    queryFn: () => getHomepageBanners(),
  });

  if (banners.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading featured banners"
        className="h-[360px] w-full animate-pulse bg-[var(--color-surface-muted)] sm:h-[480px] md:h-[560px]"
      />
    );
  }

  if (banners.isError) {
    return (
      <ErrorState
        title="Banners unavailable"
        message="The featured banners could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => banners.refetch()}
      />
    );
  }

  const bannerList = banners.data ?? [];
  const slides = bannerList.map((banner, index) => ({
    id: banner.id,
    // Real destination on the slide's anchor (PRD §8: linked via the category
    // FK, never a hard-coded URL). Resolved from the live payload at render
    // time, so an admin re-pointing a banner takes effect on the next load.
    href: `/shop/category/${banner.target_category.slug}`,
    // rules.md §10: only the first slide's image is on the critical path.
    content: <BannerSlide banner={banner} priority={index === 0} />,
  }));

  // design.md §3.7: zero published banners → the hero section is omitted
  // entirely (no empty carousel shell).
  if (slides.length === 0) {
    return null;
  }

  return (
    <Carousel
      aria-label="Featured banners"
      slides={slides}
      onSlideClick={(slide) => {
        // Same destination as slide.href, but applied in-app: `packages/ui` has
        // no router, so the anchor's href is kept for crawlers/middle-click
        // while this keeps a normal click from reloading the document.
        navigate(String(slide.href));
      }}
    />
  );
}

function BannerSlide({
  banner,
  priority,
}: {
  banner: HomepageBanner;
  /** True for the first slide only — see rules.md §10. */
  priority: boolean;
}) {
  // BE1: both fields null is the authored "image only" state and is the common
  // case, so the overlay block is conditional rather than always rendered.
  const hasOverlay = Boolean(banner.headline || banner.subtitle);

  return (
    <div className="relative h-[360px] w-full overflow-hidden sm:h-[480px] md:h-[560px]">
      {/* Decorative duplicate: the visible "Shop {category}" label already names
          the destination, so an alt here would double it in the link's accessible
          name. design.md §3.7/PRD §8 define no promo-text-inside-image use case,
          so the image is safely decorative. */}
      <img
        src={banner.asset.url}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="h-full w-full object-cover"
      />
      {/* Dark scrim (reference: `from-black/60 via-black/40 to-transparent`) so
          light-on-photo copy keeps a predictable contrast floor regardless of
          what the admin uploads. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[var(--color-surface-dark)]/70 via-[var(--color-surface-dark)]/40 to-transparent"
      />
      <div className="absolute bottom-[var(--space-6)] left-[var(--space-6)] right-[var(--space-6)] sm:left-[var(--space-7)]">
        {hasOverlay && (
          /* Frosted card, mirroring the reference's `surface-container-lowest/95
             backdrop-blur-sm` panel: the copy sits on a near-opaque light
             surface with dark text, so contrast does not depend on the photo
             behind it. Never remove as "redundant" — it is the contrast floor. */
          <div className="mb-[var(--space-4)] max-w-2xl rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)]/95 p-[var(--space-5)] shadow-[var(--shadow-2)] backdrop-blur-sm">
            {/* Plain <p>, NOT a heading: these are per-slide promo copy. An
                <h2> here would put the section headings (New Arrivals, Featured)
                below a heading of the same level as the page title's sections, and
                an <h1> would compete with the single page h1. */}
            {banner.headline && (
              <p className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-xl)] font-semibold leading-tight text-[var(--color-text-primary)] sm:text-[length:var(--font-size-2xl)]">
                {banner.headline}
              </p>
            )}
            {banner.subtitle && (
              <p className="mt-[var(--space-2)] text-[var(--color-text-secondary)]">
                {banner.subtitle}
              </p>
            )}
          </div>
        )}
        <span className="inline-flex items-center rounded-[var(--radius-full)] bg-[var(--color-surface-base)] px-[var(--space-4)] py-2 font-[family-name:var(--font-family-display)] text-sm font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-1)]">
          Shop {banner.target_category.name}
        </span>
      </div>
    </div>
  );
}

/**
 * Below this item count a band is rendered as a static, centred, wrapping row
 * instead of a Marquee.
 *
 * A marquee earns its keep only when the row is genuinely wider than the
 * viewport. With few items the duplicated loop copy is visible on screen while
 * the row is still shorter than the band, which reads as a rendering fault
 * rather than as motion; the row would also restart its travel before finishing
 * a single item. Six is where the reference's own Home bands sit, and it keeps
 * `prefers-reduced-motion` users on the same static row rather than on a band
 * that looks like it is meant to move but cannot (rules.md §4).
 */
const MARQUEE_MIN_ITEMS = 6;

/** Shared link wrapper for a band item. */
const BAND_LINK_CLASS =
  "block shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)] focus-visible:ring-offset-2";

/**
 * Band body shared by the category and brand bands: the marquee/static decision
 * and the item list. The page owns loading/error/empty and the heading, because
 * those differ per band (design.md §3.4/§3.5, §3.9).
 *
 * Items are real `Link`s rather than click-handler cards so each band item is a
 * crawlable, shareable, middle-clickable URL — the cards alone would have needed
 * `ClickableArea`, which renders `href="#"`.
 */
function BandRows<T extends { id: number }>({
  heading,
  items,
  renderItem,
}: {
  heading: string;
  items: readonly T[];
  /** Returns an element, not arbitrary ReactNode: a bare `ReactNode[]` is not
   *  assignable to Marquee's `children` prop, whereas `ReactElement[]` is. */
  renderItem: (item: T) => ReactElement;
}) {
  if (items.length >= MARQUEE_MIN_ITEMS) {
    return (
<div className="mt-[var(--space-5)]">
        {/* Marquee duplicates its children, so an item may not carry an id or a
            mount side effect - CategoryCard/BrandCard/Link satisfy both. The array
            is passed as Marquee's direct children: each item stays a direct child
            of both loop copies, which is what the -50% loop geometry requires, and
            `Children.count(children)` counts each item rather than one fragment. */}
        <Marquee ariaLabel={heading}>
          {items.map((item) => renderItem(item))}
        </Marquee>
      </div>
    );
  }

  return (
    <ul className="mt-[var(--space-5)] flex flex-wrap items-center justify-center gap-[var(--space-4)]">
      {items.map((item) => (
        <li key={item.id}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

const CATEGORY_BAND_HEADING = "Shop by Category";
const BRAND_BAND_HEADING = "Shop by Brands";

function ShopByCategory() {
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => getCategories(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  if (categories.isPending) {
    return (
      <div role="status" aria-label="Loading categories">
        <SkeletonHeading />
        <div className="mt-[var(--space-5)] flex flex-wrap justify-center gap-[var(--space-3)]">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-16 w-56 animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (categories.isError) {
    return (
      <ErrorState
        title="Categories unavailable"
        message="Product categories could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => categories.refetch()}
      />
    );
  }

  // Top level only. `getCategories()` without a parent returns the whole
  // published tree because the header nav needs both levels, so the band
  // narrows its own view rather than the shared cache. Subcategories are
  // reachable from their parent's listing page (see DECISION REQUIRED in
  // phases.md — PRD §7.2 asks for two levels here, the reference shows one).
  const items = (categories.data?.categories ?? []).filter(
    (category) => category.parent_category_id === null,
  );

  // design.md §3.9: zero published items → the section is omitted entirely.
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="shop-by-category-heading">
      <SectionHeading id="shop-by-category-heading" centered>
        {CATEGORY_BAND_HEADING}
      </SectionHeading>
      <BandRows
        heading={CATEGORY_BAND_HEADING}
        items={items}
        renderItem={(category) => (
          <Link
            key={category.id}
            to={`/shop/category/${category.slug}`}
            className={BAND_LINK_CLASS}
          >
            <CategoryCard category={category} />
          </Link>
        )}
      />
    </section>
  );
}

const NEW_ARRIVALS_HEADING = "New Arrivals";
const FEATURED_HEADING = "Featured Products";

/** How many products each merchandising row asks the API for. */
const MERCHANDISING_PER_PAGE = 8;

/** Products shown per Featured slide — a 2-up grid on small, one row of four at lg. */
const FEATURED_PER_SLIDE = 4;

/** Section link used for "View all" — a real route, not a button. */
const VIEW_ALL_LINK_CLASS =
  "inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-[var(--space-6)] py-3 font-[family-name:var(--font-family-display)] text-[length:var(--font-size-label-caps)] font-semibold uppercase tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-primary)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";

function NewArrivals() {
  const navigate = useNavigate();
  const products = useQuery({
    // Distinct key from the Featured row (queryKeys): two different filter sets,
    // so they must never share one cache entry.
    queryKey: queryKeys.productsNewArrivals,
    queryFn: () => getProducts({ sort: "newest", perPage: MERCHANDISING_PER_PAGE }),
  });

  if (products.isPending) {
    return (
      <div role="status" aria-label="Loading new arrivals">
        <SkeletonHeading />
        {/* One reference row (3 cards at lg) of skeletons — see design-reference
            `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. */}
        <div className="mt-[var(--space-5)] grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (products.isError) {
    return (
      <ErrorState
        title="New arrivals unavailable"
        message="The newest products could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => products.refetch()}
      />
    );
  }

  const items = products.data?.data ?? [];
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="new-arrivals-heading">
      <SectionHeading id="new-arrivals-heading" centered>
        {NEW_ARRIVALS_HEADING}
      </SectionHeading>
      <ul className="mt-[var(--space-5)] grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
        {items.map((product) => (
          <li key={product.id}>
            <ConnectedProductCard
              product={product}
              href={`/product/${product.slug}`}
              onViewDetails={() => navigate(`/product/${product.slug}`)}
            />
          </li>
        ))}
      </ul>
      <div className="mt-[var(--space-6)] flex justify-center">
        <Link to="/shop" className={VIEW_ALL_LINK_CLASS}>
          View all
        </Link>
      </div>
    </section>
  );
}

function FeaturedProducts() {
  const navigate = useNavigate();
  const products = useQuery({
    queryKey: queryKeys.productsFeatured,
    // `featured: true` reaches the wire as `featured=1` (BE2), so the row can
    // only ever show admin-featured products.
    queryFn: () =>
      getProducts({ featured: true, perPage: MERCHANDISING_PER_PAGE }),
  });

  if (products.isPending) {
    return (
      <div role="status" aria-label="Loading featured products">
        <SkeletonHeading />
        {/* Skeleton mirrors one slide: 4 cards (2-up on small, 4-up on lg). */}
        <div className="mt-[var(--space-5)] grid grid-cols-2 gap-[var(--space-5)] lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (products.isError) {
    return (
      <ErrorState
        title="Featured products unavailable"
        message="Featured products could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => products.refetch()}
      />
    );
  }

  const items = products.data?.data ?? [];
  if (items.length === 0) {
    return null;
  }

  // rules.md §4: one carousel component for the whole site — the hero and this
  // row are the same generic Carousel. Deliberately NOT the reference's
  // coverflow (see phases.md DECISION REQUIRED): Carousel slides are translated
  // one-at-a-time with no peeking neighbours, per-slide scale/opacity or
  // centre-only caption, so coverflow needs new capabilities rather than new
  // classes. Styling is left to the V1 visual pass.
  //
  // Four products per slide: the carousel shows one slide at a time, so a card
  // per slide would page through eight single cards. Each slide is a responsive
  // grid instead (2-up small, 4-up at lg = one full row of four).
  //
  // `autoSlide={false}`: these are cards a reader must be able to finish
  // reading (WCAG 2.2.2), and unlike the hero's promo copy the row has no
  // pause affordance of its own.
  //
  // No `onSlideClick` on purpose: each slide already holds ProductCards whose
  // main action is a real `/product/:slug` link, and wrapping them in the
  // carousel's anchor would nest anchors.
  const slides = Array.from({ length: Math.ceil(items.length / FEATURED_PER_SLIDE) }, (_, index) => {
    const group = items.slice(index * FEATURED_PER_SLIDE, (index + 1) * FEATURED_PER_SLIDE);
    return {
      id: group[0]?.id ?? index,
      content: (
        <div className="grid grid-cols-2 gap-[var(--space-5)] lg:grid-cols-4">
          {group.map((product) => (
            <ConnectedProductCard
              key={product.id}
              product={product}
              href={`/product/${product.slug}`}
              onViewDetails={() => navigate(`/product/${product.slug}`)}
            />
          ))}
        </div>
      ),
    };
  });

  return (
    <section aria-labelledby="featured-products-heading">
      <SectionHeading id="featured-products-heading" centered>
        {FEATURED_HEADING}
      </SectionHeading>
      <div className="mt-[var(--space-5)]">
        <Carousel
          aria-label="Featured products"
          slides={slides}
          autoSlide={false}
        />
      </div>
    </section>
  );
}

function ShopByBrand() {
  const brands = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => getBrands(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  if (brands.isPending) {
    return (
      <div role="status" aria-label="Loading brands">
        <SkeletonHeading />
        <div className="mt-[var(--space-5)] flex flex-wrap items-center justify-center gap-[var(--space-4)]">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-28 w-28 animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (brands.isError) {
    return (
      <ErrorState
        title="Brands unavailable"
        message="Shop brands could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => brands.refetch()}
      />
    );
  }

  // Every published brand shows here — brands are a flat list, so unlike the
  // category band there is nothing to narrow out.
  const items = brands.data?.brands ?? [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="shop-by-brands-heading">
      <SectionHeading id="shop-by-brands-heading" centered>
        {BRAND_BAND_HEADING}
      </SectionHeading>
      <BandRows
        heading={BRAND_BAND_HEADING}
        items={items}
        renderItem={(brand) => (
          <Link
            key={brand.id}
            to={`/shop/brand/${brand.slug}`}
            className={clsx(BAND_LINK_CLASS, "w-40")}
          >
            <BrandCard brand={brand} />
          </Link>
        )}
      />
    </section>
  );
}

/**
 * Home "Popular Services" shows at most this many services (frontend-plan, TASK
 * B2d-2). The slice happens after the query: getServices has no perPage
 * parameter, so the API's whole first page is fetched and truncated client-side.
 */
const POPULAR_SERVICES_COUNT = 3;

function PopularServices() {
  const navigate = useNavigate();
  const services = useQuery({
    queryKey: queryKeys.servicesHomepage,
    queryFn: () => getServices(1),
  });

  if (services.isPending) {
    return (
      <div role="status" aria-label="Loading services">
        <SkeletonHeading />
        <div className="mt-[var(--space-5)] grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (services.isError) {
    return (
      <ErrorState
        title="Services unavailable"
        message="Popular services could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => services.refetch()}
      />
    );
  }

  // At most the first three services show on the Home row; getServices has no
  // perPage parameter, so the slice happens after the query (API order kept).
  const items = (services.data?.data ?? []).slice(0, POPULAR_SERVICES_COUNT);
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="popular-services-heading">
      <SectionHeading id="popular-services-heading">Popular Services</SectionHeading>
      <ul className="mt-[var(--space-5)] grid grid-cols-1 gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-3">
        {items.map((service) => (
          <li key={service.id}>
            <ServiceCard
              service={service}
              onBookNow={() => navigate("/booking")}
              href={`/service/${service.slug}`}
              onViewDetails={() => navigate(`/service/${service.slug}`)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}