import { useNavigate } from "react-router";
import { Link } from "react-router";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  buttonStyles,
} from "@ecommerce/ui";
import { siteConfig } from "../../config/site";
import { useWishlist } from "../../hooks/useWishlist";
import { ConnectedProductCard } from "../product/ConnectedProductCard";
import { PageContainer } from "../common/PageContainer";
import { PageHeading } from "../common/PageHeading";
import {
  WISHLIST_EMPTY_DESCRIPTION,
  WISHLIST_EMPTY_LINK_LABEL,
  WISHLIST_EMPTY_TITLE,
  WISHLIST_ERROR_MESSAGE,
  WISHLIST_ERROR_TITLE,
  WISHLIST_GRID_LABEL,
  WISHLIST_LOADING_LABEL,
  WISHLIST_RETRY_LABEL,
  WISHLIST_TITLE,
} from "./wishlist-copy";

/**
 * /wishlist (TASK B4-2b). Loader-free like the rest of the storefront: the
 * wishlist is read through the SHARED `queryKeys.wishlist` entry (the same one
 * every heart uses), so the page issues at most one request.
 *
 * The heart on each card is wired through useToggleWishlist: removing an item
 * invalidates ONLY the wishlist key, so the item disappears from this grid
 * without a page reload. A guest never reaches this page (it sits behind
 * require-auth), so the heart here is always the authenticated toggle.
 */
export function WishlistView() {
  const navigate = useNavigate();
  const wishlist = useWishlist();
  const items = wishlist.items;

  return (
    <>
      <title>{`${WISHLIST_TITLE} | ${siteConfig.name}`}</title>
      <PageContainer>
        <PageHeading>{WISHLIST_TITLE}</PageHeading>

        {wishlist.isPending ? (
          <LoadingSkeleton label={WISHLIST_LOADING_LABEL} />
        ) : wishlist.isError ? (
          <ErrorState
            title={WISHLIST_ERROR_TITLE}
            message={WISHLIST_ERROR_MESSAGE}
            retryLabel={WISHLIST_RETRY_LABEL}
            onRetry={wishlist.refetch}
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-[var(--space-3)]">
            <EmptyState
              title={WISHLIST_EMPTY_TITLE}
              description={WISHLIST_EMPTY_DESCRIPTION}
            />
            <Link to="/shop" className={buttonStyles({ variant: "primary" })}>
              {WISHLIST_EMPTY_LINK_LABEL}
            </Link>
          </div>
        ) : (
          <ul
            aria-label={WISHLIST_GRID_LABEL}
            className="grid grid-cols-2 gap-[var(--space-5)] md:grid-cols-3 xl:grid-cols-4"
          >
            {items.map((item) => (
              <li key={item.id}>
                <ConnectedProductCard
                  product={item.product}
                  href={`/product/${item.product.slug}`}
                  onViewDetails={() => navigate(`/product/${item.product.slug}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </>
  );
}
