import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  getBrands,
  getBrandBySlug,
  getCategories,
  getCategoryBySlug,
  getProducts,
  type Category,
  type ProductsResponse,
} from "@ecommerce/api-client";
import {
  Breadcrumb,
  type BreadcrumbItem,
  CategoryBanner,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Modal,
  Pagination,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { queryKeys, TAXONOMY_STALE_TIME } from "../../hooks/query-keys";
import { useRedirectToLastPage } from "../../hooks/use-redirect-to-last-page";
import { ConnectedProductCard } from "../product/ConnectedProductCard";
import { ListingFilters } from "./ListingFilters";
import {
  hasActiveFilters,
  PRODUCTS_PER_PAGE,
  serializeListingParams,
  SORT_OPTIONS,
  type SortOption,
  useListingParams,
} from "./useListingParams";

interface ProductListingProps {
  categorySlug?: string;
  brandSlug?: string;
}

const PAGE_CLASS =
  "mx-auto flex w-full max-w-[1280px] flex-col gap-[var(--space-6)] px-[var(--space-6)] pb-[var(--space-8)] pt-[var(--space-7)]";
const H1_CLASS =
  "font-[family-name:var(--font-family-display)] text-[length:var(--font-size-2xl)] font-semibold leading-tight text-[var(--color-text-primary)]";
const SORT_SELECT_CLASS =
  "min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-[var(--space-3)] text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";
const BUTTON_CLASS =
  "min-h-[44px] rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-[var(--space-4)] text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";
const PILL_BASE =
  "inline-flex min-h-[36px] items-center rounded-[var(--radius-full)] border border-[var(--color-border-default)] px-[var(--space-4)] text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";
const PILL_ACTIVE =
  "border-[var(--color-brand-accent)] font-medium text-[var(--color-brand-accent)]";

/**
 * The one component behind /shop, /shop/category/:slug and /shop/brand/:slug
 * (TASK B3-1). Deliberately loader-free like Home: the record by slug, the
 * taxonomy and the filtered listing are all fetched client-side through the
 * shared queryKeys, so a route is a thin wrapper passing its slug in.
 *
 * Listing state (sort, page, price bounds, stock, search, brand) lives in the
 * URL via useListingParams — a filtered view is shareable and survives
 * reload. React 19 hoists the <title> and the not-found noindex meta from
 * wherever they render, which is why the route files export no meta().
 */
export function ProductListing({ categorySlug, brandSlug }: ProductListingProps) {
  const navigate = useNavigate();
  const { params, update, clearAll } = useListingParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const previousSignature = useRef<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => getCategories(),
    staleTime: TAXONOMY_STALE_TIME,
  });
  const brandsQuery = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => getBrands(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  // A slug resolves through its own query: 404 for a missing OR unpublished
  // record is the not-found state, not an empty listing.
  const categoryQuery = useQuery({
    queryKey: queryKeys.categoryBySlug(categorySlug ?? ""),
    queryFn: () => getCategoryBySlug(categorySlug ?? ""),
    enabled: Boolean(categorySlug),
    retry: false,
  });
  const brandQuery = useQuery({
    queryKey: queryKeys.brandBySlug(brandSlug ?? ""),
    queryFn: () => getBrandBySlug(brandSlug ?? ""),
    enabled: Boolean(brandSlug),
    retry: false,
  });

  const category = categorySlug ? categoryQuery.data?.category : undefined;
  const brand = brandSlug ? brandQuery.data?.brand : undefined;
  const brandId = brandSlug
    ? brand?.id
    : brandsQuery.data?.brands.find((item) => item.slug === params.brand)?.id;

  // The listing waits for whatever scope it depends on, so its request always
  // carries the resolved id — never an unfiltered first paint that refetches.
  const brandFilterReady = params.brand === null || brandsQuery.isSuccess;
  const productsQuery = useQuery({
    queryKey: queryKeys.productsShop({
      categoryId: category?.id,
      brandId,
      search: params.search,
      sort: params.sort,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      inStock: params.inStock,
      page: params.page,
    }),
    queryFn: () =>
      getProducts({
        categoryId: category?.id,
        brandId,
        search: params.search ?? undefined,
        sort: params.sort,
        minPrice: params.minPrice ?? undefined,
        maxPrice: params.maxPrice ?? undefined,
        inStock: params.inStock ?? undefined,
        // Page 1 is the server default: omitted from the request the same way
        // it is omitted from the URL.
        page: params.page > 1 ? params.page : undefined,
        perPage: PRODUCTS_PER_PAGE,
      }),
    enabled:
      (categorySlug ? categoryQuery.isSuccess : true) &&
      (brandSlug ? brandQuery.isSuccess : brandFilterReady),
    placeholderData: keepPreviousData,
  });

  // After a filter or page change, move focus (and the viewport) to the result
  // set so keyboard and screen-reader users land where the page changed —
  // skipped on the first render, which is not a change.
  const filterSignature = serializeListingParams(params).toString();
  useEffect(() => {
    if (previousSignature.current !== null && previousSignature.current !== filterSignature) {
      const node = resultsRef.current;
      node?.focus();
      if (typeof node?.scrollIntoView === "function") {
        node.scrollIntoView({ block: "start" });
      }
    }
    previousSignature.current = filterSignature;
  }, [filterSignature]);

  const resolutionFailed =
    (Boolean(categorySlug) && categoryQuery.isError) ||
    (Boolean(brandSlug) && brandQuery.isError);
  const pageTitle = resolutionFailed
    ? "Not found"
    : (category?.name ?? brand?.name ?? "Shop");

  const filterProps = {
    params,
    categories: categoriesQuery.data?.categories ?? [],
    brands: brandsQuery.data?.brands ?? [],
    showCategories: !categorySlug && !brandSlug,
    hideBrandFilter: Boolean(brandSlug),
    onUpdate: update,
    onClearAll: clearAll,
  };

  const data = productsQuery.data;

  const basePath = categorySlug
    ? `/shop/category/${categorySlug}`
    : brandSlug
      ? `/shop/brand/${brandSlug}`
      : "/shop";

  useRedirectToLastPage(data, (lastPage) => {
    const query = serializeListingParams({ ...params, page: lastPage });
    return `${basePath}${query.toString() ? `?${query}` : ""}`;
  });

  function renderNotFound() {
    return (
      <>
        <h1 className="sr-only">Shop</h1>
        <EmptyState
          title={categorySlug ? "Category not found" : "Brand not found"}
          description="This page does not exist or is no longer published."
          actionLabel="Back to shop"
          onAction={() => navigate("/shop")}
        />
      </>
    );
  }

  function renderError() {
    return (
      <ErrorState
        title="Products unavailable"
        message="The product listing could not be loaded. Please try again."
        retryLabel="Try again"
        onRetry={() => productsQuery.refetch()}
      />
    );
  }

  function renderListing(resolved: ProductsResponse) {
    const items = resolved.data;
    const total = resolved.total;
    const categoryList = filterProps.categories;

    const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
    if (category) {
      breadcrumbItems.push({ label: "Shop", href: "/shop" });
      const parent =
        category.parent_category_id === null
          ? undefined
          : categoryList.find((item) => item.id === category.parent_category_id);
      if (parent) {
        breadcrumbItems.push({
          label: parent.name,
          href: `/shop/category/${parent.slug}`,
        });
      }
      breadcrumbItems.push({ label: category.name });
    } else if (brand) {
      breadcrumbItems.push({ label: "Shop", href: "/shop" }, { label: brand.name });
    } else {
      breadcrumbItems.push({ label: "Shop" });
    }

    return (
      <>
        <Breadcrumb items={breadcrumbItems} onNavigate={(href) => navigate(href)} />
        {category ? (
          category.banner_asset ? (
            <CategoryBanner category={category} />
          ) : (
            <h1 className={H1_CLASS}>{category.name}</h1>
          )
        ) : brand ? (
          <h1 className={H1_CLASS}>{brand.name}</h1>
        ) : (
          <h1 className={H1_CLASS}>All Products</h1>
        )}
        {category && <SubcategoryPills category={category} categories={categoryList} />}

        <div className="flex flex-col gap-[var(--space-6)] lg:flex-row">
          <aside className="hidden shrink-0 lg:block lg:w-72">
            <div className="sticky top-[var(--space-6)]">
              <ListingFilters {...filterProps} />
            </div>
          </aside>

          <section
            ref={resultsRef}
            tabIndex={-1}
            aria-label="Products"
            aria-busy={productsQuery.isFetching}
            className="flex min-w-0 flex-1 flex-col gap-[var(--space-5)] focus:outline-none"
          >
            {total > 0 && resolved.from !== null && resolved.to !== null && (
              <div className="flex flex-wrap items-center justify-between gap-[var(--space-4)]">
                <p
                  aria-live="polite"
                  className="text-sm text-[var(--color-text-secondary)]"
                >
                  {`Showing ${resolved.from}-${resolved.to} of ${total} products`}
                </p>
                <div className="flex items-center gap-[var(--space-4)]">
                  <div className="flex items-center gap-[var(--space-2)]">
                    <label
                      htmlFor="shop-sort"
                      className="text-sm text-[var(--color-text-secondary)]"
                    >
                      Sort products
                    </label>
                    <select
                      id="shop-sort"
                      value={params.sort}
                      onChange={(event) =>
                        update({ sort: event.target.value as SortOption })
                      }
                      className={SORT_SELECT_CLASS}
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    className={clsx(BUTTON_CLASS, "lg:hidden")}
                  >
                    Filters
                  </button>
                </div>
              </div>
            )}

            {total === 0 ? (
              hasActiveFilters(params) ? (
                <EmptyState
                  title="No products match these filters"
                  description="Try widening the price range or clearing a filter to see more products."
                  actionLabel="Clear filters"
                  onAction={clearAll}
                />
              ) : (
                <EmptyState
                  title="No products yet"
                  description="Published products will appear here as soon as they are available."
                />
              )
            ) : (
              <ul className="grid grid-cols-2 gap-[var(--space-5)] md:grid-cols-3 xl:grid-cols-4">
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
            )}

            <div className="flex justify-center">
              <Pagination
                currentPage={resolved.current_page}
                lastPage={resolved.last_page}
                getHref={(page) => {
                  const query = serializeListingParams({ ...params, page }).toString();
                  return `${basePath}${query ? `?${query}` : ""}`;
                }}
                onPageChange={(page) => update({ page })}
              />
            </div>
          </section>
        </div>

        <Modal
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          aria-label="Filters"
          className="w-full max-w-[420px]"
        >
          <h2 className="mb-[var(--space-4)] text-[length:var(--font-size-md)] font-semibold text-[var(--color-text-primary)]">
            Filters
          </h2>
          <ListingFilters {...filterProps} />
        </Modal>
      </>
    );
  }

  return (
    <>
      <title>{`${pageTitle} | ${siteConfig.name}`}</title>
      {resolutionFailed && <meta name="robots" content="noindex" />}
      {category?.description && (
        <meta name="description" content={category.description} />
      )}
      {brand?.description && <meta name="description" content={brand.description} />}
      <div className={PAGE_CLASS}>
        {resolutionFailed ? (
          renderNotFound()
        ) : productsQuery.isError ? (
          renderError()
        ) : !data ? (
          <LoadingSkeleton label="Loading products" items={4} />
        ) : (
          renderListing(data)
        )}
      </div>
    </>
  );
}

/**
 * Same-branch category switcher on a category page: the parent (when there is
 * one) plus every sibling, with aria-current on the page you are on. Data
 * comes from the shared taxonomy cache — no names are hard-coded anywhere.
 */
function SubcategoryPills({
  category,
  categories,
}: {
  category: Category;
  categories: Category[];
}) {
  const parent =
    category.parent_category_id === null
      ? undefined
      : categories.find((item) => item.id === category.parent_category_id);
  const siblings = categories.filter(
    (item) => item.parent_category_id === category.parent_category_id
  );

  if (!parent && siblings.length <= 1) return null;

  return (
    <nav aria-label="Subcategories">
      <ul className="flex flex-wrap items-center gap-[var(--space-2)]">
        {parent && (
          <li>
            <Link to={`/shop/category/${parent.slug}`} className={PILL_BASE}>
              All {parent.name}
            </Link>
          </li>
        )}
        {siblings.map((sibling) => {
          const isActive = sibling.id === category.id;
          return (
            <li key={sibling.id}>
              <Link
                to={`/shop/category/${sibling.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={clsx(PILL_BASE, isActive && PILL_ACTIVE)}
              >
                {sibling.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
