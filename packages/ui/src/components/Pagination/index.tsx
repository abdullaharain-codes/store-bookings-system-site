import { clsx } from "clsx";

/**
 * Numbered pagination for a listing. Renders a `nav` of real anchors whose
 * destinations are supplied by the caller via `getHref`, so the markup stays
 * crawlable and middle-click friendly even though `packages/ui` has no router.
 *
 * A plain left click on a page link calls `onPageChange` after
 * `preventDefault`; modified clicks (ctrl/cmd/shift/alt) are left to the
 * browser so a reader can still open a page in a new tab. Exactly the same
 * click contract `ClickableArea` uses.
 */

interface PaginationProps {
  currentPage: number;
  lastPage: number;
  getHref: (page: number) => string;
  onPageChange: (page: number) => void;
  /** Accessible name for the nav. Defaults to "Pagination". */
  ariaLabel?: string;
}

/**
 * The page-number window: first, last, and currentPage with its neighbours,
 * ascending. Numbers further away than one step are elided.
 */
function pageWindow(currentPage: number, lastPage: number): number[] {
  const wanted = new Set([1, lastPage, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(wanted)
    .filter((page) => page >= 1 && page <= lastPage)
    .sort((a, b) => a - b);
}

const LINK_CLASS =
  "inline-flex min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] px-[var(--space-2)] py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-accent)]";

const CURRENT_CLASS =
  "inline-flex min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-brand-accent)] px-[var(--space-2)] py-2 text-sm font-[var(--font-weight-medium)] text-white";

const DISABLED_CLASS =
  "inline-flex min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] px-[var(--space-2)] py-2 text-sm text-[var(--color-text-secondary)] opacity-50";

export function Pagination({
  currentPage,
  lastPage,
  getHref,
  onPageChange,
  ariaLabel,
}: PaginationProps) {
  if (lastPage <= 1) return null;

  const pages = pageWindow(currentPage, lastPage);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Modified clicks are the browser's, never ours (same as ClickableArea).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    const pageNumber = Number(target.getAttribute("data-page"));
    if (Number.isInteger(pageNumber)) {
      onPageChange(pageNumber);
    }
  }

  function previousLink() {
    const label = "Previous";
    if (currentPage <= 1) {
      return (
        <span aria-disabled="true" aria-label={label} className={DISABLED_CLASS}>
          {label}
        </span>
      );
    }
    const page = currentPage - 1;
    return (
      <a
        href={getHref(page)}
        data-page={page}
        aria-label={label}
        onClick={handleClick}
        className={LINK_CLASS}
      >
        {label}
      </a>
    );
  }

  function nextLink() {
    const label = "Next";
    if (currentPage >= lastPage) {
      return (
        <span aria-disabled="true" aria-label={label} className={DISABLED_CLASS}>
          {label}
        </span>
      );
    }
    const page = currentPage + 1;
    return (
      <a
        href={getHref(page)}
        data-page={page}
        aria-label={label}
        onClick={handleClick}
        className={LINK_CLASS}
      >
        {label}
      </a>
    );
  }

  return (
    <nav aria-label={ariaLabel ?? "Pagination"}>
      <ol className="flex items-center justify-center gap-[var(--space-1)]">
        <li>{previousLink()}</li>
        {pages.map((page, index) => {
          // A gap marker when the previous rendered number jumps over pages,
          // so a long range reads as 1 … 4 5 6 … 10 rather than empty space.
          const previousPage = pages[index - 1];
          const showGap = previousPage !== undefined && page - previousPage > 1;

          return (
            <li className="flex items-center gap-[var(--space-1)]" key={page}>
              {showGap && (
                <span
                  aria-hidden="true"
                  className="px-[var(--space-1)] py-2 text-sm text-[var(--color-text-secondary)]"
                >
                  …
                </span>
              )}
              {page === currentPage ? (
                <span
                  aria-current="page"
                  aria-label={`Page ${page}`}
                  className={CURRENT_CLASS}
                >
                  {page}
                </span>
              ) : (
                <a
                  href={getHref(page)}
                  data-page={page}
                  aria-label={`Page ${page}`}
                  onClick={handleClick}
                  className={clsx(LINK_CLASS)}
                >
                  {page}
                </a>
              )}
            </li>
          );
        })}
        <li>{nextLink()}</li>
      </ol>
    </nav>
  );
}