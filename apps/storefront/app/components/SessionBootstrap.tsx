import { useEffect } from "react";
import { useAuthStore } from "@ecommerce/api-client";

/**
 * Module-level latch, not a ref: React StrictMode remounts effects in dev by
 * tearing down and re-running them, which would re-create any ref this
 * component owns. A module scope survives that, so `fetchUser` is issued once
 * per app load instead of twice.
 */
let hasBootstrapped = false;

/** Test-only: lets each test start from the "not yet bootstrapped" state. */
export function resetSessionBootstrap() {
  hasBootstrapped = false;
}

/**
 * Kicks off the one session lookup on mount and renders nothing.
 *
 * Must be mounted inside the QueryClientProvider in root.tsx. Deliberately
 * not a loader: a loader would run during prerendering, and this app is
 * prerendered statically with no server to talk to.
 */
export function SessionBootstrap() {
  useEffect(() => {
    if (hasBootstrapped) return;
    hasBootstrapped = true;
    void useAuthStore.getState().fetchUser();
  }, []);

  return null;
}
