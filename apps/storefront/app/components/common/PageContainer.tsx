import type { ReactNode } from "react";

/**
 * The single shared page wrapper for detail/listing pages (TASK B3-4 F5).
 * Previously PAGE_CLASS was copy-pasted across ProductDetail, ServiceDetail,
 * ServiceListing (and shop/ProductListing still has its own copy — out of
 * scope). One component per file keeps the width/padding rhythm consistent.
 */
const PAGE_CLASS =
  "mx-auto flex w-full max-w-[1280px] flex-col gap-[var(--space-6)] px-[var(--space-6)] pb-[var(--space-8)] pt-[var(--space-7)]";

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className={PAGE_CLASS}>{children}</div>;
}