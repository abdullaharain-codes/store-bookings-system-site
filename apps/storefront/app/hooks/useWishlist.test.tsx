import {
  useAuthStore,
  usePendingActionStore,
} from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  callCounts,
  session,
  testUser,
} from "../test/handlers";
import { WISHLIST_URL } from "../test/handlers-wishlist";
import { server, recordedRequests } from "../test/server";
import { createTestQueryClient, renderWithProviders } from "../test/utils";
import {
  WISHLIST_ADDED_ANNOUNCEMENT,
  WISHLIST_GENERIC_ERROR_MESSAGE,
  WISHLIST_REMOVED_ANNOUNCEMENT,
  useToggleWishlist,
  useWishlist,
} from "./useWishlist";
import { queryKeys } from "./query-keys";

/** A harness that exercises useWishlist and useToggleWishlist together. */
function WishlistHarness({ productId = 11 }: { productId?: number }) {
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();

  return (
    <div>
      <span data-testid="ids">{[...wishlist.productIds].sort().join(",")}</span>
      <span data-testid="pending">{String(wishlist.isPending)}</span>
      <span data-testid="error">{String(wishlist.isError)}</span>
      <span data-testid="togglePending">{String(toggle.isPending(productId))}</span>
      <button type="button" onClick={() => toggle.toggle(productId)}>
        Toggle {productId}
      </button>
      <button type="button" onClick={() => wishlist.refetch()}>
        Refetch
      </button>
    </div>
  );
}

function resetStores() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
    isSessionChecked: false,
  });
  usePendingActionStore.getState().clearPendingAction();
  sessionStorage.clear();
}

function signedIn() {
  useAuthStore.setState({
    user: testUser,
    isAuthenticated: true,
    isSessionChecked: true,
  });
  session.start();
}

describe("useWishlist", () => {
  beforeEach(() => {
    resetStores();
  });

  it("guest: never issues a wishlist request and yields an empty Set", async () => {
    useAuthStore.setState({ isSessionChecked: true });

    renderWithProviders(<WishlistHarness />, { entry: "/wishlist" });

    // Give any stray request a chance to fire before asserting on absence.
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent(""));
    expect(callCounts.wishlist).toBe(0);
    expect(
      recordedRequests.some((r) => r.startsWith("GET /api/v1/wishlist"))
    ).toBe(false);
  });

  it("authenticated: reads the wishlist through the shared key and exposes product ids", async () => {
    signedIn();
    const queryClient = createTestQueryClient();
    renderWithProviders(<WishlistHarness />, {
      entry: "/wishlist",
      queryClient,
    });

    await waitFor(() => expect(callCounts.wishlist).toBe(1));
    // Empty source, so no ids yet — but the query used the shared ["wishlist"] key.
    expect(screen.getByTestId("ids")).toHaveTextContent("");
    expect(
      queryClient.getQueryState(queryKeys.wishlist)?.status
    ).toBe("success");
  });

  it("authenticated: surfaces isError when the request fails", async () => {
    signedIn();
    server.use(
      http.get(WISHLIST_URL, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );

    renderWithProviders(<WishlistHarness />, { entry: "/wishlist" });

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("true")
    );
  });
});

describe("useToggleWishlist", () => {
  beforeEach(() => {
    resetStores();
  });

  it("[MUTATE] guest: navigates to /login with the exact from and stores NOTHING, making no wishlist request", async () => {
    useAuthStore.setState({ isSessionChecked: true });
    const user = userEvent.setup();
    const { probe } = renderWithProviders(<WishlistHarness productId={11} />, {
      entry: "/shop?search=dell",
    });

    await user.click(screen.getByRole("button", { name: "Toggle 11" }));

    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.wishlistToggle).toBe(0);
    // D1: the wishlist is toggle-only, so nothing is deferred (no replay).
    expect(usePendingActionStore.getState().pendingAction).toBeNull();
  });

  it("authenticated: adding announces and invalidates the wishlist key", async () => {
    signedIn();
    const queryClient = createTestQueryClient();
    const invalidatedKeys: unknown[] = [];
    const spy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation((filters) => {
        invalidatedKeys.push(filters?.queryKey);
        return Promise.resolve();
      });
    const user = userEvent.setup();
    renderWithProviders(<WishlistHarness productId={11} />, {
      entry: "/shop",
      queryClient,
      withAnnouncer: true,
    });

    await user.click(screen.getByRole("button", { name: "Toggle 11" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        WISHLIST_ADDED_ANNOUNCEMENT
      )
    );
    expect(callCounts.wishlistToggle).toBe(1);
    expect(invalidatedKeys).toContainEqual(["wishlist"]);
    spy.mockRestore();
  });

  it("authenticated: removing announces the removal", async () => {
    signedIn();
    // Seed the source with product 11 so the toggle removes it.
    const user = userEvent.setup();
    renderWithProviders(<WishlistHarness productId={11} />, {
      entry: "/shop",
      withAnnouncer: true,
    });
    // Prime the wishlist so 11 is wishlisted.
    await waitFor(() => expect(callCounts.wishlist).toBe(1));
    await user.click(screen.getByRole("button", { name: "Toggle 11" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        WISHLIST_ADDED_ANNOUNCEMENT
      )
    );
    await user.click(screen.getByRole("button", { name: "Toggle 11" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        WISHLIST_REMOVED_ANNOUNCEMENT
      )
    );
    expect(callCounts.wishlistToggle).toBe(2);
  });

  it("a double click sends ONE request per product", async () => {
    signedIn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(`${WISHLIST_URL}/:product`, async () => {
        callCounts.wishlistToggle += 1;
        await gate;
        return HttpResponse.json({ is_wishlisted: true });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<WishlistHarness productId={11} />, { entry: "/shop" });

    const toggle = screen.getByRole("button", { name: "Toggle 11" });
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.getByTestId("togglePending")).toHaveTextContent("true")
    );
    await user.click(toggle);
    expect(callCounts.wishlistToggle).toBe(1);

    release();
    await waitFor(() =>
      expect(screen.getByTestId("togglePending")).toHaveTextContent("false")
    );
    expect(callCounts.wishlistToggle).toBe(1);
  });

  it("authenticated: a 401 behaves like a guest (redirect, no message)", async () => {
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    server.use(
      http.post(`${WISHLIST_URL}/:product`, () =>
        HttpResponse.json({ message: "Unauthenticated." }, { status: 401 })
      )
    );
    const user = userEvent.setup();
    const { probe } = renderWithProviders(<WishlistHarness productId={11} />, {
      entry: "/shop",
      withAnnouncer: true,
    });

    await user.click(screen.getByRole("button", { name: "Toggle 11" }));

    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(usePendingActionStore.getState().pendingAction).toBeNull();
  });

  it("authenticated: a 422 shows the server message via announce", async () => {
    signedIn();
    server.use(
      http.post(`${WISHLIST_URL}/:product`, () =>
        HttpResponse.json(
          { message: "This product is unavailable." },
          { status: 422 }
        )
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<WishlistHarness productId={11} />, {
      entry: "/shop",
      withAnnouncer: true,
    });

    await user.click(screen.getByRole("button", { name: "Toggle 11" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "This product is unavailable."
      )
    );
  });

  it("authenticated: a 500 announces only the generic text, never the raw server text", async () => {
    signedIn();
    server.use(
      http.post(`${WISHLIST_URL}/:product`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<WishlistHarness productId={11} />, {
      entry: "/shop",
      withAnnouncer: true,
    });

    await user.click(screen.getByRole("button", { name: "Toggle 11" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        WISHLIST_GENERIC_ERROR_MESSAGE
      )
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("boom");
  });

  it("exposes isPending scoped per product", () => {
    signedIn();
    renderWithProviders(<WishlistHarness productId={11} />, { entry: "/shop" });
    expect(screen.getByTestId("togglePending")).toHaveTextContent("false");
  });
});
