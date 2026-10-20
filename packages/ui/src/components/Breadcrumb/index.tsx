import { clsx } from "clsx";

/**
 * Breadcrumb trail ending in the current page. `packages/ui` has no router, so
 * every non-current item is a REAL anchor with the caller-supplied `href` —
 * crawlable and middle-click friendly. The optional `onNavigate` matches
 * `ClickableArea`'s click contract: a plain left click preventDefaults and
 * hands the destination to the app, modified clicks stay with the browser.
 *
 * The last item is the current page: rendered as text with `aria-current`, and
 * deliberately NOT a link — a page breadcrumb never navigates to itself.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Accessible name for the nav. Defaults to "Breadcrumb". */
  ariaLabel?: string;
  /** SPA navigation handler, optional. See the component comment. */
  onNavigate?: (href: string) => void;
}

const LINK_CLASS =
  "text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";
const CURRENT_CLASS =
  "text-sm font-[var(--font-weight-medium)] text-[var(--color-text-primary)]";

export function Breadcrumb({ items, ariaLabel, onNavigate }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={ariaLabel ?? "Breadcrumb"}>
      <ol className="flex flex-wrap items-center gap-x-[var(--space-1)]">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center gap-x-[var(--space-1)]"
            >
              {index > 0 && (
                <span aria-hidden="true" className="text-[var(--color-text-secondary)]">
                  /
                </span>
              )}
              {isCurrent ? (
                <span aria-current="page" className={CURRENT_CLASS}>
                  {item.label}
                </span>
              ) : item.href ? (
                <a
                  href={item.href}
                  onClick={(event) => {
                    if (!onNavigate) return;
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    if (event.button !== 0) return;
                    event.preventDefault();
                    onNavigate(item.href as string);
                  }}
                  className={clsx(LINK_CLASS)}
                >
                  {item.label}
                </a>
              ) : (
                <span className={LINK_CLASS}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}