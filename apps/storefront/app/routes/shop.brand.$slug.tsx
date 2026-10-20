import { useParams } from "react-router";
import { ProductListing } from "../components/shop/ProductListing";

/**
 * /shop/brand/:slug — the shared listing scoped to a brand (TASK B3-1). The
 * slug comes from the route match, not a loader: the component resolves it
 * through its own by-slug query and renders the not-found state on a 404.
 */
export default function ShopBrand() {
  const { slug } = useParams();
  return <ProductListing brandSlug={slug} />;
}
