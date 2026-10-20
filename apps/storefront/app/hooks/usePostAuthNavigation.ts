import { useCallback, useRef, useState } from "react";
import {
  isSafeInternalPath,
  usePendingActionStore,
  useRedirectAndResume,
} from "@ecommerce/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { queryKeys } from "./query-keys";

/** Shown when a deferred action could not be replayed after sign-in. */
export const RESUME_FAILED_NOTICE =
  "We couldn't complete your last action. Please try again.";

/**
 * The post-sign-in destination logic, shared by the login and register pages
 * (rules.md §3 — one implementation, two callers).
 *
 * Order matters and is fixed:
 *   1. A pending action exists -> replay it; the hook navigates to its own
 *      stored target. If the replay fails we fall through to the `from`
 *      fallback and surface a notice.
 *   2. No pending action, but the router handed us a safe `from` -> go there.
 *   3. Otherwise go home.
 *
 * Every destination goes through isSafeInternalPath, so a crafted
 * `location.state.from` ("https://evil.test") degrades to "/" instead of
 * becoming an open redirect.
 */
export function usePostAuthNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { resumePendingAction } = useRedirectAndResume();
  const hasPendingAction = usePendingActionStore(
    (state) => state.pendingAction !== null
  );
  const [notice, setNotice] = useState<string | null>(null);
  // Guards against a double invocation (e.g. a second submit landing while the
  // first resume is still replaying) replaying the action twice.
  const inFlight = useRef(false);

  /** Resolves a `from` value, falling back to home when it is not safe. */
  const safeFrom = useCallback((): string => {
    const from = (location.state as { from?: unknown } | null)?.from;
    return typeof from === "string" && isSafeInternalPath(from) ? from : "/";
  }, [location.state]);

  const navigateHome = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      if (hasPendingAction) {
        const resumed = await resumePendingAction({
          onError: () => setNotice(RESUME_FAILED_NOTICE),
        });
        if (resumed) {
          // The replayed mutation (e.g. add-to-cart) changed server state; the
          // header badge must not keep serving a pre-replay cache entry.
          await queryClient.invalidateQueries({ queryKey: queryKeys.cart });
          return;
        }
        navigate(safeFrom(), { replace: true });
        return;
      }

      navigate(safeFrom(), { replace: true });
    } finally {
      inFlight.current = false;
    }
  }, [hasPendingAction, navigate, queryClient, resumePendingAction, safeFrom]);

  return { run, notice, dismissNotice: () => setNotice(null), navigateHome };
}
