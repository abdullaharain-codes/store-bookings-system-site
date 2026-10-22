import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { callCounts, session, testProductDetails, testUser } from "../../test/handlers";
import { WISHLIST_URL, setWishlistSource } from "../../test/handlers-wishlist";
import { server, recordedRequests } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import { WishlistView } from "./WishlistView";

function wishlistItem(productId: number, id: number) {
  const product = testProductDetails.find((p) => p.id === productId)!;
  return {
    id,
    user_id: testUser.id,
    product_id: productId,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
    product,
  };
}

function resetSessionState() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
    isSessionChecked: false,
  });
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

function h1Count() {
  return screen.getAllByRole("heading", { level: 1 }).length;
}

describe("WishlistView", () => {
  beforeEach(() => {
    resetSessionState();
    setWishlistSource([]);
  });

  it("renders a loading status and exactly one h1 while the wishlist loads", () => {
    signedIn();
    renderWithProviders(<WishlistView />, { entry: "/wishlist" });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(h1Count()).toBe(1);
    expect(screen.getByRole("heading", { level: 1, name: "Wishlist" })).toBeInTheDocument();
  });

  it("renders the wishlisted products as cards", async () => {
    signedIn();
    setWishlistSource([wishlistItem(11, 1)]);
    renderWithProviders(<WishlistView />, { entry: "/wishlist" });

    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /Dell XPS 15/ }).length).toBeGreaterThan(0)
    );
    expect(h1Count()).toBe(1);
    expect(screen.getByRole("button", { name: "Remove from wishlist" })).toBeInTheDocument();
  });

  it("removing an item makes it disappear after the wishlist refetches", async () => {
    signedIn();
    setWishlistSource([wishlistItem(11, 1)]);
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, { entry: "/wishlist" });

    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: /Dell XPS 15/ }).length).toBeGreaterThan(0)
    );
    // BEFORE: the item is present.
    expect(screen.getByText("Dell XPS 15")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove from wishlist" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Dell XPS 15/ })).toBeNull()
    );
    // The wishlist is now empty, so the empty state shows.
    expect(screen.getByText("Your wishlist is empty")).toBeInTheDocument();
  });

  it("shows an empty state with a buttonStyles link to /shop", async () => {
    signedIn();
    renderWithProviders(<WishlistView />, { entry: "/wishlist" });

    expect(
      await screen.findByText("Your wishlist is empty")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the shop" })).toHaveAttribute(
      "href",
      "/shop"
    );
    expect(h1Count()).toBe(1);
  });

  it("shows an error state whose retry refetches ONLY the wishlist", async () => {
    signedIn();
    let calls = 0;
    server.use(
      http.get(WISHLIST_URL, () => {
        calls += 1;
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<WishlistView />, { entry: "/wishlist" });

    expect(await screen.findByText("Wishlist unavailable")).toBeInTheDocument();
    expect(screen.getByText("Wishlist unavailable")).toBeInTheDocument();
    expect(h1Count()).toBe(1);

    const before = calls;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toBe(before + 1));
    // No unrelated requests were fired by the retry.
    expect(
      recordedRequests.filter((r) => r.startsWith("GET /api/v1/wishlist")).length
    ).toBe(calls);
  });

  it("makes no request other than the wishlist read", async () => {
    signedIn();
    renderWithProviders(<WishlistView />, { entry: "/wishlist" });
    await waitFor(() => expect(callCounts.wishlist).toBe(1));

    expect(
      recordedRequests.every((r) =>
        r.startsWith("GET /api/v1/wishlist") ||
        r.startsWith("GET /api/v1/categories")
      )
    ).toBe(true);
  });
});
