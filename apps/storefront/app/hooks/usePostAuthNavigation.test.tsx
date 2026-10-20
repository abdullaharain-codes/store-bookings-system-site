import { act, renderHook } from "@testing-library/react";
import { useAuthStore, usePendingActionStore } from "@ecommerce/api-client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation, type InitialEntry } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CART_ITEMS_URL, callCounts, session, testUser } from "../test/handlers";
import { server } from "../test/server";
import { createTestQueryClient } from "../test/utils";
import { queryKeys } from "./query-keys";
import {
  RESUME_FAILED_NOTICE,
  usePostAuthNavigation,
} from "./usePostAuthNavigation";

function resetStores() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
    isSessionChecked: true,
  });
  usePendingActionStore.getState().clearPendingAction();
}

let currentPath = "/login";

/** Fresh per test, so an invalidation can be observed without leaking caches. */
let queryClient: QueryClient;

/** The hook calls useQueryClient() (B4-1a invalidation), so every wrapper must
 *  sit inside a QueryClientProvider — without it the hook throws on render. */
function withQueryClient(children: ReactNode, entry: InitialEntry) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        {children}
        <PathProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function PathProbe() {
  currentPath = useLocation().pathname + useLocation().search;
  return null;
}

/** Wrapper with a plain /login entry and no router state. */
function wrapper({ children }: { children: ReactNode }) {
  return withQueryClient(children, "/login");
}

/** Wrapper whose /login entry carries the given `from` state. */
function wrapperWithFrom(from: string) {
  return function FromWrapper({ children }: { children: ReactNode }) {
    return withQueryClient(children, { pathname: "/login", state: { from } });
  };
}

/** Overrides the cart endpoint with a 500 and keeps the call counter. */
function failCartItems() {
  server.use(
    http.post(CART_ITEMS_URL, () => {
      callCounts.cartItems += 1;
      return HttpResponse.json({ message: "boom" }, { status: 500 });
    })
  );
}

describe("usePostAuthNavigation", () => {
  beforeEach(() => {
    resetStores();
    currentPath = "/login";
    queryClient = createTestQueryClient();
    // The hook runs *after* a successful sign-in, so the session is live;
    // the POST /cart/items replay is an authenticated request.
    session.start();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("branch 3: no pending action and no from lands on /", async () => {
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });
    await act(() => result.current.run());

    expect(currentPath).toBe("/");
  });

  it("branch 2: a safe from is honoured", async () => {
    const { result } = renderHook(() => usePostAuthNavigation(), {
      wrapper: wrapperWithFrom("/account/orders?page=2"),
    });
    await act(() => result.current.run());

    expect(currentPath).toBe("/account/orders?page=2");
  });

  it("branch 2: an unsafe from is rejected and falls back to /", async () => {
    const { result } = renderHook(() => usePostAuthNavigation(), {
      wrapper: wrapperWithFrom("https://evil.test/steal"),
    });
    await act(() => result.current.run());

    expect(currentPath).toBe("/");
  });

  it("branch 2: a protocol-relative from is rejected", async () => {
    const { result } = renderHook(() => usePostAuthNavigation(), {
      wrapper: wrapperWithFrom("//evil.test"),
    });
    await act(() => result.current.run());

    expect(currentPath).toBe("/");
  });

  it("branch 1: a pending action is replayed and navigates to its own target", async () => {
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 2 },
    });
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });

    await act(() => result.current.run());

    expect(callCounts.cartItems).toBe(1);
    expect(currentPath).toBe("/cart");
    expect(result.current.notice).toBeNull();
  });

  it("branch 1: a successful replay invalidates queryKeys.cart", async () => {
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 2 },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });

    await act(() => result.current.run());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cart });
  });

  it("branch 1: a failed replay does not invalidate the cart", async () => {
    failCartItems();
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 2 },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });

    await act(() => result.current.run());

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("branch 1 failure: shows the notice and falls back to the safe from", async () => {
    failCartItems();
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 2 },
    });
    const { result } = renderHook(() => usePostAuthNavigation(), {
      wrapper: wrapperWithFrom("/account"),
    });

    await act(() => result.current.run());

    expect(callCounts.cartItems).toBe(1);
    expect(result.current.notice).toBe(RESUME_FAILED_NOTICE);
    expect(currentPath).toBe("/account");
  });

  it("branch 1 failure with no from falls back to /", async () => {
    failCartItems();
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 1 },
    });
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });

    await act(() => result.current.run());

    expect(result.current.notice).toBe(RESUME_FAILED_NOTICE);
    expect(currentPath).toBe("/");
  });

  it("a replay only happens once even when run is called twice", async () => {
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 1 },
    });
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });

    await act(async () => {
      await Promise.all([result.current.run(), result.current.run()]);
    });

    expect(callCounts.cartItems).toBe(1);
  });

  it("dismissNotice clears the message", async () => {
    failCartItems();
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 1 },
    });
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });
    await act(() => result.current.run());
    expect(result.current.notice).not.toBeNull();

    act(() => result.current.dismissNotice());

    expect(result.current.notice).toBeNull();
  });

  it("does not touch the auth store — the caller owns that", async () => {
    const { result } = renderHook(() => usePostAuthNavigation(), { wrapper });
    await act(() => result.current.run());

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).not.toBe(testUser);
  });
});
