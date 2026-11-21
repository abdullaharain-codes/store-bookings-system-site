import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Listing pages' guard for an out-of-range ?page= (TASK B3-4 F3).
 *
 * Laravel's paginator does NOT clamp the requested page — `?page=99` comes
 * back as `{ data: [], current_page: 99, total: N, last_page: real }`. Without
 * this hook a shareable (or edge-triggered) URL past the last page would sit on
 * a stray empty view. So when a response is empty, has a real total, AND its
 * current_page is beyond last_page, the URL is REPLACED (not pushed) with the
 * last valid page — one request, no history clutter, no loop (the target page
 * resolves to a non-empty, in-range response).
 *
 * A total of 0 is a genuine empty catalogue/result set and must NOT redirect —
 * the listings render their empty states instead.
 */
interface PaginatorLike {
  data: unknown[];
  total: number;
  current_page: number;
  last_page: number;
}

export function useRedirectToLastPage(
  data: PaginatorLike | undefined,
  getHref: (lastPage: number) => string,
): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (data === undefined) return;
    const { data: items, total, current_page: currentPage, last_page: lastPage } = data;
    const href = getHref(lastPage);
    const current = location.pathname + location.search;
    if (
      items.length === 0 &&
      total > 0 &&
      currentPage > lastPage &&
      href !== current
    ) {
      navigate(href, { replace: true });
    }
  }, [data, getHref, location.pathname, location.search, navigate]);
}