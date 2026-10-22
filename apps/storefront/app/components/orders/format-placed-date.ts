/**
 * Formats an order's placed date for display (TASK B4-2a).
 *
 * A tiny tested utility rather than an inline `new Date(...)` in the view: the
 * server sends an ISO-8601 timestamp, and the page must render it in the
 * BROWSER's locale and timezone with no hard-coded zone. A missing or invalid
 * timestamp renders as an empty string so the row is simply omitted instead of
 * printing "Invalid Date".
 */
export function formatPlacedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
