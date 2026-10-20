/**
 * Guards for values that are later handed to `navigate()` or to the HTTP
 * client. Both must stay same-origin and relative: a value that starts with a
 * scheme, a second slash or a backslash can escape the app (open redirect) or
 * smuggle a control character into a request.
 */

const MAX_PATH_LENGTH = 2048;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function isSafeRelativePath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_PATH_LENGTH) return false;
  // A single leading slash keeps the value in-app; "//" and "\" are the
  // protocol-relative and backslash forms browsers treat as another origin.
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes("://")) return false;
  if (CONTROL_CHARACTERS.test(value)) return false;
  return true;
}

/** True for a route path that is safe to pass to `navigate()`. */
export function isSafeInternalPath(value: unknown): boolean {
  return isSafeRelativePath(value);
}

/** True for a same-origin API path that is safe to replay. */
export function isSafeApiUrl(value: unknown): boolean {
  return isSafeRelativePath(value);
}
