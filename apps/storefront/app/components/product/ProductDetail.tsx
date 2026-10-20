import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  getCategories,
  getProductBySlug,
  type Category,
  type Product,
  type ProductImage,
} from "@ecommerce/api-client";
import {
  Badge,
  Breadcrumb,
  type BreadcrumbItem,
  Button,
  ErrorState,
  LoadingSkeleton,
  PriceTag,
  QuantityInput,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { META_DESCRIPTION_MAX } from "../../config/seo";
import { queryKeys, TAXONOMY_STALE_TIME } from "../../hooks/query-keys";
import { isNotFoundError } from "../../lib/is-not-found";
import { DetailNotFound } from "../common/DetailNotFound";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";

/**
 * /product/:slug (TASK B3-2). Data-driven and loader-free like the rest of the
 * storefront: the product and the shared taxonomy are fetched client-side, so
 * the route file stays a thin wrapper and the prerender set is unchanged.
 *
 * Add-to-Cart and wishlist are rendered but DISABLED here — B4 passes the two
 * optional handlers below; until then the buttons keep the ProductCard
 * behaviour of being inert rather than pretending to work.
 */
interface ProductDetailProps {
  slug: string;
  onAddToCart?: (productId: number, quantity: number) => void;
  onWishlistToggle?: (productId: number) => void;
  statusMessage?: string | null;
}

/** Accessible name of the purchase-options group (quantity + cart + wishlist). */
export const PURCHASE_OPTIONS_GROUP_LABEL = "Purchase options";

/** Distance from the root: a top-level category is 0, a child is 1, etc. */
function categoryDepth(category: Category, all: Category[]): number {
  let depth = 0;
  let current: Category | undefined = category;
  const seen = new Set<number>();
  while (current && current.parent_category_id !== null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = all.find((item) => item.id === current!.parent_category_id);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

/**
 * The root-to-deepest chain for a product's assigned categories, resolved
 * against the shared taxonomy (the product payload only carries the assigned
 * category, not its ancestors' names). Chooses the deepest assignment when a
 * product sits in more than one branch.
 */
function buildCategoryChain(
  productCategories: Category[],
  all: Category[]
): Category[] {
  if (productCategories.length === 0) return [];

  let deepest = productCategories[0];
  let deepestDepth = -1;
  for (const category of productCategories) {
    const depth = categoryDepth(category, all);
    if (depth > deepestDepth) {
      deepest = category;
      deepestDepth = depth;
    }
  }

  const chain: Category[] = [];
  const seen = new Set<number>();
  let current: Category | undefined = deepest;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current =
      current.parent_category_id === null
        ? undefined
        : all.find((item) => item.id === current!.parent_category_id);
  }
  return chain;
}

export function ProductDetail({
  slug,
  onAddToCart,
  onWishlistToggle,
  statusMessage,
}: ProductDetailProps) {
  const navigate = useNavigate();

  const productQuery = useQuery({
    queryKey: queryKeys.productBySlug(slug),
    queryFn: () => getProductBySlug(slug),
    enabled: Boolean(slug),
    retry: false,
  });

  // Shared taxonomy cache (no duplicate request when the shell already loaded
  // it). Failure here must not block the page — the breadcrumb degrades.
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => getCategories(),
    staleTime: TAXONOMY_STALE_TIME,
  });

  const product = productQuery.data?.product;
  const notFound = productQuery.isError && isNotFoundError(productQuery.error);
  const metaDescription = product?.description
    ? product.description.slice(0, META_DESCRIPTION_MAX)
    : null;
  const pageTitle = notFound ? "Product not found" : (product?.name ?? "Product");

  return (
    <>
      <title>{`${pageTitle} | ${siteConfig.name}`}</title>
      {notFound && <meta name="robots" content="noindex" />}
      {metaDescription && <meta name="description" content={metaDescription} />}

      <PageContainer>
        {notFound ? (
          <DetailNotFound
            title="Product not found"
            message="This product does not exist or is no longer available."
            breadcrumbItems={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
            ]}
            backHref="/shop"
            backLabel="Back to shop"
            onNavigate={(href) => navigate(href)}
          />
        ) : productQuery.isError ? (
          <>
            <h1 className="sr-only">Product unavailable</h1>
            <ErrorState
              title="Product unavailable"
              message="This product could not be loaded. Please try again."
              retryLabel="Try again"
              onRetry={() => productQuery.refetch()}
            />
          </>
        ) : !product ? (
          <>
            <h1 className="sr-only">Loading product</h1>
            <LoadingSkeleton label="Loading product" />
          </>
        ) : (
          <ProductDetailContent
            key={product.id}
            product={product}
            categories={
              categoriesQuery.isSuccess ? categoriesQuery.data.categories : null
            }
            onAddToCart={onAddToCart}
            onWishlistToggle={onWishlistToggle}
            statusMessage={statusMessage}
          />
        )}
      </PageContainer>
    </>
  );
}

function ProductDetailContent({
  product,
  categories,
  onAddToCart,
  onWishlistToggle,
  statusMessage,
}: {
  product: Product;
  categories: Category[] | null;
  onAddToCart?: (productId: number, quantity: number) => void;
  onWishlistToggle?: (productId: number) => void;
  statusMessage?: string | null;
}) {
  const navigate = useNavigate();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const outOfStock = product.stock_quantity === 0;

  const chain =
    categories === null ? [] : buildCategoryChain(product.categories, categories);
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Shop", href: "/shop" },
  ];
  for (const category of chain) {
    breadcrumbItems.push({
      label: category.name,
      href: `/shop/category/${category.slug}`,
    });
  }
  breadcrumbItems.push({ label: product.name });

  return (
    <>
      <Breadcrumb items={breadcrumbItems} onNavigate={navigate} />
      <PageHeading>{product.name}</PageHeading>

      <div className="grid gap-[var(--space-6)] lg:grid-cols-2">
        <Gallery
          images={product.images}
          productName={product.name}
          activeIndex={activeImageIndex}
          onSelect={setActiveImageIndex}
        />

        <div className="flex flex-col items-start gap-[var(--space-4)]">
          {product.brand && (
            <Link
              to={`/shop/brand/${product.brand.slug}`}
              className="text-[length:var(--font-size-label-caps)] font-semibold uppercase tracking-[var(--letter-spacing-label-caps)] text-[var(--color-text-muted)] hover:text-[var(--color-brand-accent)]"
            >
              {product.brand.name}
            </Link>
          )}

          <Badge variant={outOfStock ? "error" : "success"}>
            {outOfStock ? "Out of stock" : "In stock"}
          </Badge>

          {product.sku && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {`SKU: ${product.sku}`}
            </p>
          )}

          <PriceTag
            price={product.price}
            compareAtPrice={product.compare_at_price}
            discountPercent={product.discount_percent}
          />

          <div
            role="group"
            aria-label={PURCHASE_OPTIONS_GROUP_LABEL}
            className="flex flex-col items-start gap-[var(--space-4)]"
          >
            <QuantityInput
              id="product-quantity"
              value={quantity}
              onChange={setQuantity}
              max={product.stock_quantity}
              disabled={outOfStock}
            />

            <div className="flex flex-wrap gap-[var(--space-3)]">
              <Button
                type="button"
                variant="primary"
                disabled={outOfStock || !onAddToCart}
                onClick={() => onAddToCart?.(product.id, quantity)}
              >
                Add to Cart
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!onWishlistToggle}
                onClick={() => onWishlistToggle?.(product.id)}
              >
                Add to wishlist
              </Button>
            </div>

            <p
              role="status"
              className="text-sm text-[var(--color-text-secondary)]"
            >
              {statusMessage ?? ""}
            </p>
          </div>

          {product.description && (
            <p className="whitespace-pre-line text-sm text-[var(--color-text-secondary)]">
              {product.description}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Gallery({
  images,
  productName,
  activeIndex,
  onSelect,
}: {
  images: ProductImage[];
  productName: string;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-muted)] text-sm text-[var(--color-text-secondary)]">
        No image
      </div>
    );
  }

  const main = images[activeIndex]?.asset ?? images[0].asset;

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <img
        src={main.url}
        alt={main.alt_text ?? productName}
        width={main.width ?? undefined}
        height={main.height ?? undefined}
        loading="eager"
        fetchPriority="high"
        className="aspect-square w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-muted)] object-contain"
      />
      {images.length > 1 && (
        <ul className="flex flex-wrap gap-[var(--space-2)]">
          {images.map((image, index) => {
            const selected = index === activeIndex;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={`Show image ${index + 1} of ${images.length}`}
                  aria-current={selected ? "true" : undefined}
                  aria-pressed={selected}
                  onClick={() => onSelect(index)}
                  className="block h-20 w-20 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]"
                >
                  <img
                    src={image.asset.thumbnail_url ?? image.asset.url}
                    alt=""
                    loading="lazy"
                    width={image.asset.width ?? undefined}
                    height={image.asset.height ?? undefined}
                    className="h-full w-full object-contain"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
