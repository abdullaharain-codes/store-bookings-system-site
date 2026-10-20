import { isAxiosError } from "axios";

/**
 * True when an unknown thrown value is an axios rejection carrying a 404.
 * Shared by ProductDetail and ServiceDetail's not-found branches (TASK B3-4
 * F5). Detail 404s are expected failures (unpublished/missing slugs reject
 * identically), so they render a noindex not-found state instead of a retry.
 */
export function isNotFoundError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}