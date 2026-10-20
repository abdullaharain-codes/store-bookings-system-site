import { ProductListing } from "../components/shop/ProductListing";

/**
 * /shop — one line into the shared listing (TASK B3-1). No loader/meta here:
 * the listing owns its queries, and React 19 hoists the title it renders.
 */
export default function ShopIndex() {
  return <ProductListing />;
}
