import {
  useAuthStore,
  usePendingActionStore,
} from "@ecommerce/api-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
  type RouteObject,
} from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionBootstrap, resetSessionBootstrap } from "../components/SessionBootstrap";
import { SiteHeader } from "../components/SiteHeader";
import { AnnouncerProvider } from "../components/common/Announcer";
import RequireAuth from "../routes/require-auth";
import Login from "../routes/login";
import ProductRoute from "../routes/product.$slug";
import CartRoute from "../routes/cart";
import CheckoutRoute from "../routes/checkout";
import OrderDetailRoute from "../routes/account.orders.$id";
import { callCounts, session, setCartItemsSource, testUser } from "./handlers";
import { testAddresses } from "./handlers-checkout";
import { createTestQueryClient } from "./utils";

/**
 * B4-2a end-to-end: the REAL product page, /cart, /checkout, the order detail
 * route, the REAL SiteHeader badge and the REAL require-auth guard. It proves
 * the whole slice hangs together — a full authenticated checkout empties the
 * badge, and a guest bounced to /login returns to /checkout having submitted NO
 * order request.
 *
 * Thin items: checkout's own states are covered exhaustively by
 * CheckoutView.test.tsx and OrderDetailView.test.tsx; this file only wires the
 * real routes together.
 */

function startApp(initialEntry: string) {
  const probe = { path: initialEntry };
  // Assign through a function (not `probe.path = ...` in the component body) —
  // mirroring add-to-cart.flow.test.tsx, which keeps oxlint's react(immutability)
  // rule quiet about a variable defined outside the component.
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
          children: [
            { path: "cart", element: <CartRoute /> },
            { path: "checkout", element: <CheckoutRoute /> },
            { path: "account/orders/:id", element: <OrderDetailRoute /> },
          ],
        },
        { path: "product/:slug", element: <ProductRoute /> },
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

/** Signs in a user directly (the login page itself is covered elsewhere). */
function signInDirectly() {
  session.start();
  useAuthStore.setState({
    user: {
      id: testUser.id,
      name: "Ada Lovelace",
      email: testUser.email,
      role: { id: 2, name: "Customer", slug: "customer" },
    },
    isAuthenticated: true,
    isSessionChecked: true,
  });
}

describe("checkout flow", () => {
  beforeEach(() => {
    resetStores();
    resetSessionBootstrap();
  });

  it("an authenticated user checks out and lands on the order page with the badge emptied", async () => {
    // One line already in the cart (the add-to-cart step is B4-1a's flow).
    setCartItemsSource([
      {
        id: 1,
        cart_id: 1,
        product_id: 11,
        quantity: 1,
        hold_expires_at: null,
        hold_status: "active",
      },
    ]);
    signInDirectly();

    const { probe } = startApp("/checkout");
    const user = userEvent.setup();

    await waitFor(() =>
      expect(useAuthStore.getState().isSessionChecked).toBe(true)
    );

    // Checkout renders with a preselected address and the place-order button.
    const placeOrder = await screen.findByRole("button", {
      name: "Place order (Cash on delivery)",
    });
    await waitFor(() => expect(placeOrder).toBeEnabled());

    await user.click(placeOrder);

    // Landed on the order detail page with ?placed=1, showing the order number.
    await waitFor(() => expect(probe.path).toContain("/account/orders/1"));
    expect(probe.path).toContain("placed=1");
    expect(
      await screen.findByText("Thank you — your order has been placed")
    ).toBeInTheDocument();

    // The cart is now empty, so the header badge shows no count.
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Cart, \d+ item/ })).toBeNull()
    );
  });

  it("a guest hitting /checkout is bounced to /login and returns with NO order request", async () => {
    setCartItemsSource([
      {
        id: 1,
        cart_id: 1,
        product_id: 11,
        quantity: 1,
        hold_expires_at: null,
        hold_status: "active",
      },
    ]);

    const { probe } = startApp("/checkout");
    const user = userEvent.setup();

    // No session: the guard sends the guest to /login.
    await waitFor(() => expect(probe.path).toBe("/login"));

    await user.type(await screen.findByLabelText("Email"), testUser.email);
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // Back on /checkout, and NOTHING was submitted on the way.
    await waitFor(() => expect(probe.path).toBe("/checkout"));
    expect(callCounts.orderPlace).toBe(0);
    expect(testAddresses.length).toBeGreaterThan(0);
  });
});
