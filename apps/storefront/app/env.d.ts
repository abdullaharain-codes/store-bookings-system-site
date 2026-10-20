/// <reference types="vite/client" />

/**
 * Build-time identity for the storefront. Every value has a safe default so a
 * fresh clone runs with no .env at all; the shell reads them from
 * `app/config/site.ts` and never from `import.meta.env` directly, so the set of
 * supported knobs lives in one typed place.
 */
interface ImportMetaEnv {
  readonly VITE_SITE_NAME?: string;
  readonly VITE_SITE_TAGLINE?: string;
  readonly VITE_SITE_ANNOUNCEMENT?: string;
  readonly VITE_SITE_SUPPORT_EMAIL?: string;
  readonly VITE_SITE_SUPPORT_PHONE?: string;
  readonly VITE_SITE_ADDRESS?: string;
  readonly VITE_SITE_COPYRIGHT_YEAR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
