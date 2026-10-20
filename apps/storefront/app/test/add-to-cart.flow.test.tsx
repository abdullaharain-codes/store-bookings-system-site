import { useAuthStore, usePendingActionStore } from "@ecommerce/api-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse, delay } from "msw";
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
import ProductRoute from "../routes/product.$slug";
import Login from "../routes/login";
import {
  CART_ITEMS_URL,
  addToCartSource,
  callCounts,
  session,
  setCartItemsSource,
  testUser,
} from "./handlers";
import { server } from "./server";
import { createTestQueryClient, renderWithProviders } from "./utils";

/**
 * B4-1a end-to-end: the REAL product page (routes/product.$slug), the REAL
 * Login page, the REAL ResumeBootstrap and the REAL SiteHeader badge. Unlike
 * redirect-and-resume.flow.test.tsx, no stand-in Add to Cart button: a guest
 * reaches the add on a real product and the replayed request must be visible
 * in the header cart badge.
 */

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
          <SiteHeader />
          <LocationProbe />
          <Outlet />
        </>
      ),
      children: [
        { index: true, element: <HomePage /> },
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

async function signInOnLoginPage() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), testUser.email);
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("add-to-cart flow", () => {
  beforeEach(() => {
    resetStores();
    resetSessionBootstrap();
  });

  it("a guest adds qty 2 on a real product, signs in, the replay runs once and the header badge shows 1 item", async () => {
    setCartItemsSource([]);
    server.use(
      http.post(CART_ITEMS_URL, async ({ request }) => {
        callCounts.cartItems += 1;
        const body = (await request.json()) as {
          product_id: number;
          quantity: number;
        };
        // Hold the replay back so the first (empty) GET /cart settles first:
        // the badge provably updates only because the replay invalidates it.
        await delay(40);
        addToCartSource(body.product_id, body.quantity);
        return HttpResponse.json(
          {
            cart_item: { id: 1, product_id: body.product_id, quantity: body.quantity },
          },
          { status: 201 }
        );
      })
    );
    const { probe } = startApp("/product/dell-xps-15");
    const user = userEvent.setup();

    await waitFor(() =>
      expect(useAuthStore.getState().isSessionChecked).toBe(true)
    );

    // A real, wired Add to Cart button on the real product page.
    const addToCart = await screen.findByRole("button", { name: "Add to Cart" });
    expect(addToCart).toBeEnabled();

    const quantity = screen.getByLabelText("Quantity");
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.click(addToCart);

    // Deferred: nothing posted, and the guest is routed through login.
    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(0);

    await signInOnLoginPage();

    // Replayed exactly once, back on the product page.
    await waitFor(() => expect(probe.path).toBe("/product/dell-xps-15"));
    expect(callCounts.cartItems).toBe(1);
    expect(usePendingActionStore.getState().pendingAction).toBeNull();

    // The badge now reflects the replayed line item.
    const cartLinks = await screen.findAllByRole("link", { name: "Cart, 1 item" });
    expect(cartLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Cart" })).toBeNull();
  });

  it("a replay failure (422) shows the coarse resume notice, never the raw server error", async () => {
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/product/dell-xps-15",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 11, quantity: 2 },
    });
    server.use(
      http.post(CART_ITEMS_URL, () => {
        callCounts.cartItems += 1;
        return HttpResponse.json({ message: "Hold expired" }, { status: 422 });
      })
    );
    const { probe } = renderWithProviders(<Login />, {
      entry: "/login",
      state: { from: "/product/dell-xps-15" },
    });

    await signInOnLoginPage();

    await waitFor(() => expect(probe.path).toBe("/product/dell-xps-15"));
    const notice = await screen.findByTestId("resume-notice");
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(
      "We couldn't complete your last action. Please try again."
    );
    expect(notice).not.toHaveTextContent("Hold expired");
    expect(session.active).toBe(true);
  });
});