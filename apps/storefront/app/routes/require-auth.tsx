import { isSafeInternalPath, useAuthStore } from "@ecommerce/api-client";
import { LoadingSkeleton } from "@ecommerce/ui";
import { Navigate, Outlet, useLocation } from "react-router";

/**
 * Builds the redirect state for a blocked guest.
 *
 * `from` is only echoed when `isSafeInternalPath` accepts it, because /login
 * will use it as a destination: an absolute or protocol-relative value there
 * would be an open redirect. Exported for the unit test that feeds it crafted
 * locations the router itself cannot produce.
 */
export function buildLoginRedirectState(location: {
  pathname: string;
  search: string;
}): { from?: string } | undefined {
  const target = location.pathname + location.search;
  return isSafeInternalPath(target) ? { from: target } : undefined;
}

/**
 * Pathless layout guarding the per-user surfaces (/cart, /wishlist,
 * /account/*). It holds no business logic: it only decides between
 * "still asking", "not signed in" and "render the child".
 *
 * Not prerendered — react-router.config.ts keeps these routes out of the
 * static HTML, and a redirect decided at build time would freeze a
 * build-machine session into the bundle.
 */
export default function RequireAuth() {
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  // Unknown session: hold on a status region rather than redirecting, so a
  // signed-in visitor deep-linking to /cart is never bounced to /login. The
  // page frame around this comes from routes/site-layout.tsx.
  if (!isSessionChecked) {
    return <LoadingSkeleton label="Checking your session" />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate to="/login" replace state={buildLoginRedirectState(location)} />
    );
  }

  return <Outlet />;
}
