import type { ReactNode } from "react";

/**
 * The single shared page heading for detail/listing pages (TASK B3-4 F5).
 * Previously H1_CLASS was copy-pasted across ProductDetail, ServiceDetail,
 * ServiceListing, DetailNotFound (and shop/ProductListing still has its own
 * copy — out of scope).
 */
const H1_CLASS =
  "font-[family-name:var(--font-family-display)] text-[length:var(--font-size-2xl)] font-semibold leading-tight text-[var(--color-text-primary)]";

export function PageHeading({ children }: { children: ReactNode }) {
  return <h1 className={H1_CLASS}>{children}</h1>;
}