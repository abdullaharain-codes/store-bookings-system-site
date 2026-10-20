import { siteConfig } from "../config/site";
import { PageContainer } from "../components/common/PageContainer";
import { PageHeading } from "../components/common/PageHeading";

/** The one visible h1 on the placeholder checkout page. */
export const CHECKOUT_TITLE = "Checkout";

/**
 * /checkout — a thin, loader-free placeholder behind the require-auth guard so
 * the cart's "Proceed to checkout" link is never dead (TASK B4-1c, deliberate
 * scope limit). Like /cart it is per-user and CSR-only, so it is not
 * prerendered; the real checkout flow lands in a later task.
 */
export default function CheckoutRoute() {
  return (
    <>
      <title>{`${CHECKOUT_TITLE} | ${siteConfig.name}`}</title>
      <PageContainer>
        <PageHeading>{CHECKOUT_TITLE}</PageHeading>
      </PageContainer>
    </>
  );
}
