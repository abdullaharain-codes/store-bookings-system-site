import { Outlet } from "react-router";

/**
 * Shop area layout — hosts the all-products index and the category/brand
 * detail child routes. Leaf routes render their own headings inside it.
 *
 * No <main> here: the site shell (routes/site-layout.tsx) owns the single
 * <main id="main-content"> that the skip link in app/root.tsx targets.
 */
export default function ShopLayout() {
  return <Outlet />;
}