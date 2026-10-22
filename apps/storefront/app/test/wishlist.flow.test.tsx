import { useAuthStore, usePendingActionStore } from "@ecommerce/api-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
  type RouteObject,
} from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionBootstrap,
  resetSessionBootstrap,
} from "../components/SessionBootstrap";
import { SiteHeader } from "../components/SiteHeader";
import { AnnouncerProvider } from "../components/common/Announcer";
import RequireAuth from "../routes/require-auth";
import Login from "../routes/login";
import ProductRoute from "../routes/product.$slug";
import ShopIndex from "../routes/shop._index";
import WishlistRoute from "../routes/wishlist";
import { callCounts, session, testUser } from "./handlers";
import { createTestQueryClient } from "./utils";

/**
 * B4-2b end-to-end: the REAL /shop listing, the REAL /wishlist page, the REAL
 * product page, the REAL SiteHeader and the REAL require-auth guard.
 *
 * It proves the D1 guest rule at the integration level — a guest heart bounces
 * to /login, returns to the SAME /shop URL (query intact), and NO wishlist
 * request is ever made during the whole flow. The authenticated path adds an
 * item from a card, sees it on /wishlist and removes it; a guest Buy Now defers
 * the add-to-cart and lands on /checkout without placing an order.
 */

function startApp(initialEntry: string) {
  const probe = { path: initialEntry };
  const report = (path: string) => {
    probe.path = path;
  };

  function LocationProbe() {
    const location = useLocation();
    report(location.pathname + location.search);
    return null;
  }

  const routes: RouteObject[] = [
    {
      path: "/",
      element: (
        <AnnouncerProvider>
          <SessionBootstrap />
          <SiteHeader />
          <LocationProbe />
          <Outlet />
        </AnnouncerProvider>
      ),
      children: [
        {
          element: <RequireAuth />,
          children: [{ path: "wishlist", element: <WishlistRoute /> }],
        },
        { path: "shop", element: <ShopIndex /> },
        { path: "product/:slug", element: <ProductRoute /> },
        { path: "checkout", element: <div>Checkout</div> },
        { path: "login", element: <Login /> },
      ],
    },
  ];

  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return { router, probe };
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

function signInDirectly() {
  session.start();
  useAuthStore.setState({
    user: testUser,
    isAuthenticated: true,
    isSessionChecked: true,
  });
}

describe("wishlist flow", () => {
  beforeEach(() => {
    resetStores();
    resetSessionBootstrap();
  });

  it("guest: heart on /shop goes to /login, returns to the SAME URL (query intact) with NO wishlist request", async () => {
    const { probe } = startApp("/shop?search=dell");
    const user = userEvent.setup();

    // The listing loads cards with wired hearts; use the first.
    const hearts = await screen.findAllByRole("button", {
      name: "Add to wishlist",
    });
    await user.click(hearts[0]);

    // Bounced to /login — no wishlist request on the way.
    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.wishlistToggle).toBe(0);
    expect(callCounts.wishlist).toBe(0);

    await user.type(await screen.findByLabelText("Email"), testUser.email);
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // Back on the SAME /shop URL, query string included, and STILL no toggle:
    // the wishlist is toggle-only, so nothing was replayed (owner decision D1).
    await waitFor(() => expect(probe.path).toBe("/shop?search=dell"));
    expect(callCounts.wishlistToggle).toBe(0);
    expect(usePendingActionStore.getState().pendingAction).toBeNull();
  });

  it("authenticated: adds a product from a card, sees it on /wishlist and removes it", async () => {
    signInDirectly();
    const { probe, router } = startApp("/shop");
    const user = userEvent.setup();

    const hearts = await screen.findAllByRole("button", {
      name: "Add to wishlist",
    });
    await user.click(hearts[0]);

    await waitFor(() => expect(callCounts.wishlistToggle).toBe(1));

    // Open /wishlist through the real router (no header link exists yet).
    await router.navigate("/wishlist");
    await waitFor(() => expect(probe.path).toBe("/wishlist"));

    const remove = await screen.findByRole("button", {
      name: "Remove from wishlist",
    });
    const grid = screen.getByRole("list", { name: "Saved products" });
    expect(within(grid).getAllByRole("listitem").length).toBeGreaterThan(0);

    await user.click(remove);

    // Removing it empties the grid.
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Saved products" })
      ).toBeNull()
    );
    expect(screen.getByText("Your wishlist is empty")).toBeInTheDocument();
  });

  it("guest Buy Now defers the cart add with targetRoute /checkout and places NO order", async () => {
    const { probe } = startApp("/product/dell-xps-15");
    const user = userEvent.setup();

    await screen.findByRole("heading", { level: 1, name: "Dell XPS 15" });
    await user.click(screen.getByRole("button", { name: "Buy now" }));

    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(0);

    const pending = usePendingActionStore.getState().pendingAction;
    expect(pending).toEqual({
      method: "POST",
      url: "/cart/items",
      data: { product_id: 11, quantity: 1 },
      targetRoute: "/checkout",
      timestamp: expect.any(Number),
    });

    await user.type(await screen.findByLabelText("Email"), testUser.email);
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // ONE cart POST replayed, landing on /checkout, with NO order placed.
    await waitFor(() => expect(probe.path).toBe("/checkout"));
    expect(callCounts.cartItems).toBe(1);
    expect(callCounts.orderPlace).toBe(0);
  });
});
