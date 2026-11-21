import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  useAuthStore,
  usePendingActionStore,
  useRedirectAndResume,
} from "@ecommerce/api-client";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
  type RouteObject,
} from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionBootstrap, resetSessionBootstrap } from "../components/SessionBootstrap";
import Login from "../routes/login";
import RequireAuth from "../routes/require-auth";
import { callCounts, session, testUser } from "./handlers";
import { createTestQueryClient } from "./utils";

/**
 * End-to-end redirect-and-resume through the real Login page, the real
 * RequireAuth guard, the real SessionBootstrap and the real pending-action
 * store. Only the product route is a stand-in, because
 * routes/product.$slug.tsx is still a placeholder from an earlier task.
 */

function AddToCartButton() {
  const { requireAuth } = useRedirectAndResume();
  return (
    <button
      type="button"
      onClick={() =>
        requireAuth({
          method: "POST",
          url: "/cart/items",
          data: { product_id: 42, quantity: 2 },
          targetRoute: "/cart",
        })
      }
    >
      Add to cart
    </button>
  );
}

function ProductPage() {
  return (
    <main id="main-content">
      <h1>Product</h1>
      <AddToCartButton />
    </main>
  );
}

function CartPage() {
  return (
    <main id="main-content">
      <h1>Cart</h1>
    </main>
  );
}

function HomePage() {
  return (
    <main id="main-content">
      <h1>Home</h1>
    </main>
  );
}

function startApp(initialEntry: string) {
  const probe = { path: initialEntry };
  const report = (p: string) => {
    probe.path = p;
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
        <>
          <SessionBootstrap />
          <LocationProbe />
          <Outlet />
        </>
      ),
      children: [
        { index: true, element: <HomePage /> },
        { path: "product/:slug", element: <ProductPage /> },
        {
          element: <RequireAuth />,
          children: [{ path: "cart", element: <CartPage /> }],
        },
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

async function signInOnLoginPage() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), testUser.email);
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("redirect-and-resume flow", () => {
  beforeEach(() => {
    resetStores();
    // The bootstrap latch is module-level (one fetch per app load), so it has
    // to be released for the next test in this file.
    resetSessionBootstrap();
  });

  it("scenario 1: a guest defers an add-to-cart, signs in, and the action replays exactly once", async () => {
    const { probe } = startApp("/product/laptop");
    const user = userEvent.setup();

    await waitFor(() =>
      expect(useAuthStore.getState().isSessionChecked).toBe(true)
    );
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    // Deferred: no cart request yet, and the pending action is stored.
    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(0);
    expect(usePendingActionStore.getState().pendingAction).not.toBeNull();

    await signInOnLoginPage();

    await waitFor(() => expect(probe.path).toBe("/cart"));
    expect(callCounts.cartItems).toBe(1);
    expect(usePendingActionStore.getState().pendingAction).toBeNull();
    expect(sessionStorage.getItem("pending-action")).toBeNull();
    expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
  });

  it("scenario 2: a guest opening /cart directly is bounced to login and lands on /cart with no cart-add request", async () => {
    const { probe } = startApp("/cart");

    await waitFor(() => expect(probe.path).toBe("/login"));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Sign in|Login/i })).toBeInTheDocument());

    await signInOnLoginPage();

    await waitFor(() => expect(probe.path).toBe("/cart"));
    expect(callCounts.cartItems).toBe(0);
    expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
  });

  it("scenario 3: an already-valid session renders /cart without ever showing login", async () => {
    // A valid session cookie already exists before the app loads, so the
    // bootstrap's GET /auth/user returns 200.
    session.start();
    const { probe } = startApp("/cart");

    await waitFor(() =>
      expect(useAuthStore.getState().isSessionChecked).toBe(true)
    );
    expect(callCounts.user).toBe(1);
    expect(probe.path).toBe("/cart");
    expect(screen.getByRole("heading", { name: "Cart" })).toBeInTheDocument();
    expect(callCounts.cartItems).toBe(0);
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });

  it("shows the session-check status before any redirect decision", async () => {
    startApp("/cart");

    // First paint: a status region, not a redirect and not a login flash.
    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
