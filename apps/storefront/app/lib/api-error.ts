/**
 * Shared axios-error parsing (TASK B4-2a, 0.3).
 *
 * One place for the rule the cart page and the add-to-cart hook each used to
 * implement separately: a 409/422 carries the server's own user-safe message
 * verbatim; every other status collapses to the caller's generic line so raw
 * error text (stack fragments, SQLSTATE strings) is never rendered to a
 * shopper. 422 field errors (the `errors` bag) are exposed separately for
 * forms that map messages onto matching inputs.
 */

interface ApiErrorShape {
  response?: {
    status?: unknown;
    data?: {
      message?: unknown;
      errors?: unknown;
    };
  };
}

function asApiError(error: unknown): ApiErrorShape | null {
  return typeof error === "object" && error !== null
    ? (error as ApiErrorShape)
    : null;
}

/** HTTP status of an axios-style error, or 0 when absent/non-numeric. */
export function getApiErrorStatus(error: unknown): number {
  const status = asApiError(error)?.response?.status;
  return typeof status === "number" ? status : 0;
}

/** Top-level `message` string of an axios-style error, or "" when absent. */
export function getApiErrorMessage(error: unknown): string {
  const message = asApiError(error)?.response?.data?.message;
  return typeof message === "string" ? message : "";
}

/**
 * The 422 `errors` bag keyed by field, or {} — only entries whose value is a
 * non-empty string array count, so a malformed bag cannot leak odd shapes
 * into form code.
 */
export function getApiFieldErrors(error: unknown): Record<string, string[]> {
  const errors = asApiError(error)?.response?.data?.errors;
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) {
    return {};
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(
    errors as Record<string, unknown>
  )) {
    if (
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every((entry) => typeof entry === "string")
    ) {
      fieldErrors[field] = messages as string[];
    }
  }
  return fieldErrors;
}

/**
 * The message to show a shopper: the server's own top-level message ONLY for
 * 409/422 (the statuses whose messages are written for end users by
 * CartService/OrderService), else the caller's generic fallback.
 */
export function userMessageFor(error: unknown, fallback: string): string {
  const status = getApiErrorStatus(error);
  const message = getApiErrorMessage(error);
  if ((status === 409 || status === 422) && message) return message;
  return fallback;
}
