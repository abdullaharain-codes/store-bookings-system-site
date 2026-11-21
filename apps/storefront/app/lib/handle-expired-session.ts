import { useAuthStore } from "@ecommerce/api-client";

/**
 * Handles a 401 from an authenticated request: drops the local session so the
 * require-auth guard redirects the shopper to /login. Use this in components
 * that are already behind require-auth and need to react to a mid-flight
 * session expiry.
 */
export function handleExpiredSession(): void {
  useAuthStore.setState({ isAuthenticated: false, user: null });
}
