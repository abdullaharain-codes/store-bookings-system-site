/**
 * Static, non-taxonomy identity for the site shell.
 *
 * Deliberately NOT here: category and brand names, logos and banners. Those come
 * from the API at runtime (see useNavCategories / useNavBrands) so a merchant
 * never has to redeploy the storefront to rename a category.
 *
 * Every field resolves to a safe default, so the shell renders with no .env
 * present. `.env.example` documents the optional overrides.
 */

export interface FooterLink {
  label: string;
  to: string;
}

export interface SiteConfig {
  /** Wordmark in the header and footer. Also the accessible name of the home link. */
  name: string;
  /** One-line positioning under the footer wordmark. */
  tagline: string;
  /** Promotional strip above the header. Rendered only when set. */
  announcement: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  address: string | null;
  /**
   * Fixed at build time on purpose. A `new Date().getFullYear()` in the render
   * path would bake one year into the prerendered HTML and disagree with the
   * client after hydration on 1 January.
   */
  copyrightYear: number;
  /**
   * Reference footer lists Privacy / Terms / Contact / Warranty / Return, but
   * no such route exists yet. Empty by default so the shell never renders a
   * dead link; entries are added as the legal pages land.
   */
  footerLinks: FooterLink[];
}

/** Treats blank and whitespace-only env values as "not configured". */
function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function text(value: string | undefined, fallback: string): string {
  return optional(value) ?? fallback;
}

const FALLBACK_COPYRIGHT_YEAR = 2026;

function copyrightYear(raw: string | undefined): number {
  const parsed = Number(raw?.trim());
  return Number.isInteger(parsed) && parsed > 2000 ? parsed : FALLBACK_COPYRIGHT_YEAR;
}

export const siteConfig: SiteConfig = {
  name: text(import.meta.env.VITE_SITE_NAME, "TechFix"),
  tagline: text(
    import.meta.env.VITE_SITE_TAGLINE,
    "Expert IT products, repair and support."
  ),
  announcement: text(
    import.meta.env.VITE_SITE_ANNOUNCEMENT,
    "Cash on Delivery available nationwide"
  ),
  supportEmail: optional(import.meta.env.VITE_SITE_SUPPORT_EMAIL),
  supportPhone: optional(import.meta.env.VITE_SITE_SUPPORT_PHONE),
  address: optional(import.meta.env.VITE_SITE_ADDRESS),
  copyrightYear: copyrightYear(import.meta.env.VITE_SITE_COPYRIGHT_YEAR),
  footerLinks: [],
};
