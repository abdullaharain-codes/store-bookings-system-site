import { Link } from "react-router";
import { siteConfig } from "../config/site";

/**
 * Site footer.
 *
 * Follows the reference: a dim surface with a top border, a brand column with a
 * tagline, an optional links column, and a legal line. The reference also shows
 * contact details, social icons and a newsletter field — none of which exist in
 * this app yet, so they are omitted rather than faked with dead `href="#"`.
 *
 * The copyright year is a build-time constant (see siteConfig) so the
 * prerendered HTML and the hydrated client can never disagree.
 */
export function SiteFooter() {
  const { name, tagline, footerLinks, supportEmail, supportPhone, address, copyrightYear } =
    siteConfig;
  const hasContact = Boolean(supportEmail || supportPhone || address);

  return (
    <footer className="border-t border-[var(--color-border-default)] bg-[var(--color-surface-muted)]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-10 md:flex-row md:justify-between md:px-6">
        <div className="max-w-sm">
          <Link
            to="/"
            className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-lg)] font-bold text-[var(--color-brand-accent)]"
          >
            {name}
          </Link>
          <p className="mt-2 text-[length:var(--font-size-sm)] text-[var(--color-text-secondary)]">
            {tagline}
          </p>
        </div>

        {footerLinks.length > 0 && (
          <nav aria-label="Footer">
            <h2 className="text-[length:var(--font-size-sm)] font-semibold text-[var(--color-text-primary)]">
              Links
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {footerLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-[length:var(--font-size-sm)] text-[var(--color-text-secondary)] underline-offset-4 hover:text-[var(--color-brand-accent)] hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {hasContact && (
          <div>
            <h2 className="text-[length:var(--font-size-sm)] font-semibold text-[var(--color-text-primary)]">
              Contact
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-[length:var(--font-size-sm)] text-[var(--color-text-secondary)]">
              {address && <li>{address}</li>}
              {supportPhone && (
                <li>
                  <a href={`tel:${supportPhone}`} className="hover:underline">
                    {supportPhone}
                  </a>
                </li>
              )}
              {supportEmail && (
                <li>
                  <a href={`mailto:${supportEmail}`} className="hover:underline">
                    {supportEmail}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border-default)]">
        <p className="mx-auto max-w-[1280px] px-4 py-4 text-[length:var(--font-size-xs)] text-[var(--color-text-secondary)] md:px-6">
          &copy; {copyrightYear} {name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
