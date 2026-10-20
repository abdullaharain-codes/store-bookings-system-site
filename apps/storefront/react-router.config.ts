import type { Config } from "@react-router/dev/config";

/**
 * Storefront static-site generation config — mirrors the verified spike
 * (/spike-ssg-poc/) exactly: SPA Mode (ssr: false) + prerender(), NOT
 * ssr: true (which would need a Node runtime at serve time, violating the
 * static-hosting constraint; see frontend-plan.md "Survey conclusion").
 *
 * With ssr: false the build emits one static HTML + .data file per
 * prerendered route plus a single __spa-fallback.html, and produces NO server
 * bundle.
 *
 * Prerendered now (public static pages): /, /shop, /services, /login,
 * /register. Excluded on purpose:
 *   - /cart, /wishlist, /account/*, /booking/* — auth-gated or inherently
 *     per-user surfaces; pure CSR, never prerendered (frontend-plan.md).
 *   - Dynamic detail routes (/product/:slug, /service/:slug,
 *     /shop/category/:slug, /shop/brand/:slug) — prerendered later once real
 *     product/service/brand/category slugs exist to enumerate from
 *     (spike pattern: prerender a known slug list).
 */
export default {
  ssr: false,
  async prerender() {
    return ["/", "/shop", "/services", "/login", "/register"];
  },
} satisfies Config;