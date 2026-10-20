import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { AnnouncerProvider } from "../components/common/Announcer";

/**
 * Records the current location so a test can assert where navigation landed.
 * Reset by passing a fresh object to renderWithRouter per test.
 */
export function createPathProbe() {
  const probe = { path: "/" };
  function PathProbe() {
    probe.path = useLocation().pathname + useLocation().search;
    return null;
  }
  return { probe, PathProbe };
}

/**
 * Renders a node inside a MemoryRouter whose initial location can carry router
 * state (used by the login/register pages to read `state.from`).
 */
export function renderWithRouter(
  ui: ReactNode,
  options?: { entry?: string; state?: unknown }
) {
  const { probe, PathProbe } = createPathProbe();
  const entry =
    options?.state !== undefined
      ? { pathname: options.entry ?? "/", state: options.state }
      : options?.entry ?? "/";

  const result = render(
    <MemoryRouter initialEntries={[entry]}>
      {ui}
      <PathProbe />
    </MemoryRouter>
  );

  return { ...result, probe };
}

/**
 * Test QueryClient. `retry: false` keeps failure-path tests to a single request
 * instead of waiting out the backoff schedule; `staleTime: 0` lets a test seed
 * and then read the cache without a refetch racing the assertion.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

/**
 * Renders a node inside both providers the site shell needs: TanStack Query
 * (the header reads live taxonomy and the cart count) and a MemoryRouter. A
 * caller-supplied QueryClient lets a test inspect or seed the cache.
 *
 * `withAnnouncer` is OPT-IN on purpose: the site layout's live region is always
 * mounted, so including it by default would break every existing
 * `queryByRole("status")` null-wait. Tests that assert announcements pass it.
 */
export function renderWithProviders(
  ui: ReactNode,
  options?: {
    entry?: string;
    state?: unknown;
    queryClient?: QueryClient;
    withAnnouncer?: boolean;
  }
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const { probe, PathProbe } = createPathProbe();
  const entry =
    options?.state !== undefined
      ? { pathname: options?.entry ?? "/", state: options.state }
      : options?.entry ?? "/";

  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        {ui}
        <PathProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const result = render(
    options?.withAnnouncer ? <AnnouncerProvider>{tree}</AnnouncerProvider> : tree
  );

  return { ...result, probe, queryClient };
}
