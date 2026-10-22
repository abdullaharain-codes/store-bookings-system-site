import {
  buildAddCartItemRequest,
  useAuthStore,
  usePendingActionStore,
} from "@ecommerce/api-client";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CART_ITEMS_URL, callCounts, session, testUser } from "../test/handlers";
import { server } from "../test/server";
import {
  createTestQueryClient,
  renderWithProviders,
} from "../test/utils";
import {
  ADD_TO_CART_GENERIC_ERROR_MESSAGE,
  ADD_TO_CART_SUCCESS_MESSAGE,
  useAddToCart,
} from "./useAddToCart";
import { queryKeys } from "./query-keys";

/**
 * A direct-API harness around useAddToCart. `quantity` is passed through
 * untouched so the tests can probe the hook's validity gate without lint
 * picking up a prop mutation (the flow renderers wrap the callback instead).
 */
function AddToCartHarness({
  productId = 11,
  quantity,
}: {
  productId?: number;
  quantity?: number;
}) {
  const { addToCart, isPending, message } = useAddToCart();
  return (
    <div>
      <button
        type="button"
        onClick={() => addToCart(productId, quantity)}
      >
        Add {productId} x {String(quantity)}
      </button>
      <span data-testid="pending">{String(isPending)}</span>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

/** Three invalid-quantity buttons, so one render can probe all of them. */
function InvalidQuantityHarness({ productId = 11 }: { productId?: number }) {
  const { addToCart, message } = useAddToCart();
  return (
    <div>
      <button type="button" onClick={() => addToCart(productId, 0)}>
        add zero
      </button>
      <button type="button" onClick={() => addToCart(productId, 1.5)}>
        add fraction
      </button>
      <button type="button" onClick={() => addToCart(productId, Number.NaN)}>
        add nan
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

/** A Buy Now harness: adds then navigates to the redirectAfter path. */
function BuyNowHarness({
  productId = 11,
  quantity = 2,
  redirectAfter = "/checkout",
}: {
  productId?: number;
  quantity?: number;
  redirectAfter?: string | null;
}) {
  const { addToCart, isPending, message } = useAddToCart();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          addToCart(productId, quantity, redirectAfter ?? undefined)
        }
      >
        Buy {productId} x {quantity}
      </button>
      <span data-testid="pending">{String(isPending)}</span>
      {message && <p role="status">{message}</p>}
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

describe("useAddToCart", () => {
  beforeEach(() => {
    resetStores();
  });

  it("guest: stores the pending action and navigates to /login without calling the API", async () => {
    useAuthStore.setState({ isSessionChecked: true });
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <AddToCartHarness productId={11} quantity={2} />,
      {
        entry: "/product/dell-xps-15?utm=test",
      }
    );

    await user.click(screen.getByRole("button", { name: "Add 11 x 2" }));

    // Never a cart request and never a raw error — the session simply redirects.
    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(0);

    const pending = usePendingActionStore.getState().pendingAction;
    expect(pending).toEqual({
      ...buildAddCartItemRequest(11, 2),
      targetRoute: "/product/dell-xps-15?utm=test",
      timestamp: expect.any(Number),
    });
    expect(pending?.url).toBe("/cart/items");
  });

  it("guest: the deferred quantity is preserved in the pending action", async () => {
    useAuthStore.setState({ isSessionChecked: true });
    const user = userEvent.setup();
    renderWithProviders(<AddToCartHarness productId={11} quantity={2} />, {
      entry: "/product/dell-xps-15",
    });

    await user.click(screen.getByRole("button", { name: "Add 11 x 2" }));
    await waitFor(() =>
      expect(usePendingActionStore.getState().pendingAction).not.toBeNull()
    );

    expect(
      usePendingActionStore.getState().pendingAction?.data
    ).toEqual({ product_id: 11, quantity: 2 });
  });

  it("guest: an error or server shortage is never shown, because no request was made", async () => {
    useAuthStore.setState({ isSessionChecked: true });
    const user = userEvent.setup();
    renderWithProviders(<AddToCartHarness productId={11} quantity={2} />, {
      entry: "/product/dell-xps-15",
    });

    await user.click(screen.getByRole("button", { name: "Add 11 x 2" }));
    await waitFor(() =>
      expect(usePendingActionStore.getState().pendingAction).not.toBeNull()
    );

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("authenticated: posts to /cart/items, reports success and invalidates the cart query", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.cart, { cart: { items: [] } });
    const user = userEvent.setup();
    renderWithProviders(<AddToCartHarness productId={11} quantity={2} />, {
      queryClient,
      entry: "/product/dell-xps-15",
    });

    await user.click(screen.getByRole("button", { name: "Add 11 x 2" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent(ADD_TO_CART_SUCCESS_MESSAGE);
    expect(callCounts.cartItems).toBe(1);
    // The same ["cart"] key the header badge reads, so a live badge refetches.
    expect(queryClient.getQueryState(queryKeys.cart)?.isInvalidated).toBe(true);
  });

  it("authenticated: surfaces the server message on 422/409 instead of a generic one", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    server.use(
      http.post(CART_ITEMS_URL, () =>
        HttpResponse.json({ message: "Only 3 left in stock." }, { status: 422 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<AddToCartHarness productId={11} quantity={10} />, {
      entry: "/product/dell-xps-15",
    });

    await user.click(screen.getByRole("button", { name: "Add 11 x 10" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent("Only 3 left in stock.");
  });

  it("authenticated: a 5xx shows only a generic message, never the raw server text", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    server.use(
      http.post(CART_ITEMS_URL, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<AddToCartHarness productId={11} quantity={1} />, {
      entry: "/product/dell-xps-15",
    });

    await user.click(screen.getByRole("button", { name: "Add 11 x 1" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(ADD_TO_CART_GENERIC_ERROR_MESSAGE);
    expect(status).not.toHaveTextContent("boom");
  });

  it("authenticated: a 401 mid-flight is treated as an expired session and defers again", async () => {
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <AddToCartHarness productId={11} quantity={1} />,
      { entry: "/product/dell-xps-15" }
    );

    await user.click(screen.getByRole("button", { name: "Add 11 x 1" }));

    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(1);
    expect(usePendingActionStore.getState().pendingAction).not.toBeNull();
    expect(
      usePendingActionStore.getState().pendingAction?.data
    ).toEqual({ product_id: 11, quantity: 1 });
  });

  it("invalid quantities (0, 1.5, NaN) are rejected before any request", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<InvalidQuantityHarness productId={11} />, {
      entry: "/product/dell-xps-15",
    });

    await user.click(screen.getByRole("button", { name: "add zero" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent(ADD_TO_CART_GENERIC_ERROR_MESSAGE);

    await user.click(screen.getByRole("button", { name: "add fraction" }));
    await user.click(screen.getByRole("button", { name: "add nan" }));

    // All three invalid clicks produced no cart request and no deferred action.
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(callCounts.cartItems).toBe(0);
    expect(usePendingActionStore.getState().pendingAction).toBeNull();
  });

  it("a second click while the request is still pending is a no-op", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    let releaseRequest!: () => void;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    server.use(
      http.post(CART_ITEMS_URL, async () => {
        callCounts.cartItems += 1;
        await requestGate;
        return HttpResponse.json(
          { cart_item: { id: 1, product_id: 11, quantity: 1 } },
          { status: 201 }
        );
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<AddToCartHarness productId={11} quantity={1} />, {
      entry: "/product/dell-xps-15",
    });

    const addButton = screen.getByRole("button", { name: "Add 11 x 1" });
    await user.click(addButton);
    await waitFor(() =>
      expect(screen.getByTestId("pending")).toHaveTextContent("true")
    );
    // A second click while the first request is still held open must be a no-op.
    await user.click(addButton);
    expect(callCounts.cartItems).toBe(1);

    releaseRequest();
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent(ADD_TO_CART_SUCCESS_MESSAGE);
    expect(callCounts.cartItems).toBe(1);
  });

  it("Buy Now (authenticated): adds once then navigates to the redirect path, with NO order request", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <BuyNowHarness productId={11} quantity={2} redirectAfter="/checkout" />,
      { entry: "/product/dell-xps-15" }
    );

    await user.click(screen.getByRole("button", { name: "Buy 11 x 2" }));

    await waitFor(() => expect(probe.path).toBe("/checkout"));
    expect(callCounts.cartItems).toBe(1);
    expect(callCounts.orderPlace).toBe(0);
  });

  it("Buy Now (authenticated): a 422 stock error stays on the page and shows the server message", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    server.use(
      http.post(CART_ITEMS_URL, () =>
        HttpResponse.json({ message: "Only 3 left in stock." }, { status: 422 })
      )
    );
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <BuyNowHarness productId={11} quantity={10} redirectAfter="/checkout" />,
      { entry: "/product/dell-xps-15" }
    );

    await user.click(screen.getByRole("button", { name: "Buy 11 x 10" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Only 3 left in stock.");
    expect(probe.path).toBe("/product/dell-xps-15");
  });

  it("Buy Now (guest): defers with targetRoute /checkout and the exact add-to-cart body, no request", async () => {
    useAuthStore.setState({ isSessionChecked: true });
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <BuyNowHarness productId={11} quantity={2} redirectAfter="/checkout" />,
      { entry: "/product/dell-xps-15" }
    );

    await user.click(screen.getByRole("button", { name: "Buy 11 x 2" }));

    await waitFor(() => expect(probe.path).toBe("/login"));
    expect(callCounts.cartItems).toBe(0);
    const pending = usePendingActionStore.getState().pendingAction;
    expect(pending).toEqual({
      ...buildAddCartItemRequest(11, 2),
      targetRoute: "/checkout",
      timestamp: expect.any(Number),
    });
  });

  it("Buy Now: an unsafe redirectAfter is ignored (no navigation)", async () => {
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    const user = userEvent.setup();
    const { probe } = renderWithProviders(
      <BuyNowHarness
        productId={11}
        quantity={2}
        redirectAfter="https://evil.test"
      />,
      { entry: "/product/dell-xps-15" }
    );

    await user.click(screen.getByRole("button", { name: "Buy 11 x 2" }));

    await waitFor(() => expect(callCounts.cartItems).toBe(1));
    expect(probe.path).toBe("/product/dell-xps-15");
  });
});