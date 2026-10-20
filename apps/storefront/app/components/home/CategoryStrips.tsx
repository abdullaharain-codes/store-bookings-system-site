import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getCategories, getProducts } from "@ecommerce/api-client";
import { ErrorState, LoadingSkeleton } from "@ecommerce/ui";
import { ConnectedProductCard } from "../product/ConnectedProductCard";
import { queryKeys, TAXONOMY_STALE_TIME } from "../../hooks/query-keys";

/**
 * Home "category strips" (TASK B2d-1): up to four strips, one per published
 * TOP-LEVEL category (parent_category_id === null), in the API's order
 * (display_order - CategoryController already sorts before serialising). Each
 * strip is a labelled region (aria-labelledby its h2) showing up to four of
 * that category's products as ProductCards in a plain 2-col / lg 4-col grid -
 * explicitly NOT a Carousel, per the task (the reference renders this row as a
 * horizontal scroller with chevrons; the grid is the storefront's decision).
 *
 * Data is admin-editable and must appear immediately on publish (PRD A13), so
 * exactly like every other Home section this block is loader-free and renders
 * from live API responses. The categories come from the shared
 * `queryKeys.categories` cache (same request the nav and Shop by Category band
 * use - no second categories request); each strip owns its own products query
 * keyed by category id so caches never bleed between strips or rows. While that
 * shared query is pending or failed the block renders nothing: the "Shop by
 * Category" band already owns those two states on the same key.
 *
 * A strip whose product list is empty is hidden entirely (heading included);
 * if no strip remains (or no top-level category exists) the whole block is
 * absent (design.md A3.9). Loading shows a skeleton per strip; an error shows
 * a per-strip ErrorState with retry (design.md A3.9) - never raw error text.
 *
 * Category name is an h2, never another h1: the page's single h1 is the
 * sr-only page title owned by the Home route (see routes/_index.tsx).
 */
const STRIP_PRODUCT_COUNT = 4;
/** The reference homepage shows its top-level rows capped at four. */
const MAX_STRIPS = 4;

function StripHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-2xl)] font-semibold leading-tight text-[var(--color-text-primary)]"
    >
      {children}
    </h2>
  );
}

function StripSkeletonHeading() {
  return (
    <div
      aria-hidden="true"
      className="h-7 w-48 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)]"
    />
  );
}

const VIEW_ALL_LINK_CLASS =
  "inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-[var(--space-6)] py-3 font-[family-name:var(--font-family-display)] text-[length:var(--font-size-label-caps)] font-semibold uppercase tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-primary)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";

export function CategoryStrips() {
  const navigate = useNavigate();
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => getCategories(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  // Derived before useQueries so the hook is unconditional (the list starts
  // empty while categories are pending; useQueries handles a changing length).
  const topLevel = (categories.data?.categories ?? [])
    .filter((category) => category.parent_category_id === null)
    .slice(0, MAX_STRIPS);

  const stripQueries = useQueries({
    queries: topLevel.map((category) => ({
      queryKey: queryKeys.productsByCategory(category.id),
      queryFn: () =>
        getProducts({ categoryId: category.id, perPage: STRIP_PRODUCT_COUNT }),
    })),
  });

  // The "Shop by Category" band owns the shared categories query's loading
  // skeleton and error state (same key, same page), so this block must not
  // duplicate them: while the query is pending or failed, render nothing.
  if (categories.isPending || categories.isError) {
    return null;
  }

  if (topLevel.length === 0) {
    return null;
  }

  const stripBlocks = topLevel.map((category, index) => {
    const products = stripQueries[index];
    const headingId = `strip-${category.id}-heading`;

    if (products.isPending) {
      return (
        <div
          key={category.id}
          role="status"
          aria-label={`Loading ${category.name} products`}
        >
          <StripSkeletonHeading />
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
        <section key={category.id} aria-labelledby={headingId}>
          <StripHeading id={headingId}>{category.name}</StripHeading>
          <div className="mt-[var(--space-5)]">
            <ErrorState
              title={`${category.name} products unavailable`}
              message={`Products in ${category.name} could not be loaded. Please try again.`}
              retryLabel="Try again"
              onRetry={() => products.refetch()}
            />
          </div>
        </section>
      );
    }

    const items = products.data?.data ?? [];
    if (items.length === 0) {
      return null;
    }

    return (
      <section key={category.id} aria-labelledby={headingId}>
        <StripHeading id={headingId}>{category.name}</StripHeading>
        <ul className="mt-[var(--space-5)] grid grid-cols-2 gap-[var(--space-5)] lg:grid-cols-4">
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
          <Link to={`/shop/category/${category.slug}`} className={VIEW_ALL_LINK_CLASS}>
            View all
          </Link>
        </div>
      </section>
    );
  });

  // All strips resolved to no products (and no skeleton/error pending): the
  // whole block is absent.
  if (stripBlocks.every((block) => block === null)) {
    return null;
  }

  return <>{stripBlocks}</>;
}