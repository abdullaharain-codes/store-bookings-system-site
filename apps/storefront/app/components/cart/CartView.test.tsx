import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SiteHeader } from "../SiteHeader";
import { CartView } from "./CartView";
import {
  CART_URL,
  callCounts,
  cartPatchBodies,
  session,
  setCartItemsSource,
  setCartUpdateError,
  testCartItems,
  testProductDetails,
  testUser,
} from "../../test/handlers";
import { recordedRequests, server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";

/** The default cart, enriched with products, as the real GET /cart returns it. */
function cartPayload() {
  return {
    cart: {
      id: 1,
      user_id: testUser.id,
      items: testCartItems.map((item) => ({
        ...item,
        product: testProductDetails.find((p) => p.id === item.product_id),
      })),
    },
  };
}

/** Finds the <li> for a product by its name link. */
function lineFor(name: string): HTMLElement {
  const link = screen.getByRole("link", { name });
  const line = link.closest("li");
  if (!line) throw new Error(`no cart line for ${name}`);
  return line;
}

beforeEach(() => {
  session.start();
  useAuthStore.setState({
    user: testUser,
    isAuthenticated: true,
    isSessionChecked: true,
    isLoading: false,
    error: null,
    fieldErrors: null,
  });
});

afterEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isSessionChecked: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
  });
});

describe("CartView", () => {
  it("shows a loading status, then the lines with prices and a subtotal", async () => {
    server.use(
      http.get(CART_URL, async () => {
        callCounts.cart += 1;
        await delay(50);
        return HttpResponse.json(cartPayload());
      })
    );
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

    expect(
      screen.getByRole("status", { name: "Loading cart" })
    ).toBeInTheDocument();

    const dell = await screen.findByRole("link", { name: "Dell XPS 15" });
    expect(dell).toHaveAttribute("href", "/product/dell-xps-15");
    expect(screen.getByRole("heading", { level: 1, name: "Cart" })).toBeInTheDocument();
    expect(document.title).toBe("Cart | TechFix");
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("Rs. 1,090,000");
  });

  it("shows a retryable error and refetches only the cart", async () => {
    let failing = true;
    server.use(
      http.get(CART_URL, () => {
        callCounts.cart += 1;
        if (failing) {
          return HttpResponse.json({ message: "Server error" }, { status: 500 });
        }
        return HttpResponse.json(cartPayload());
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

    expect(await screen.findByRole("alert")).toHaveTextContent("Cart unavailable");

    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("link", { name: "Dell XPS 15" })
    ).toBeInTheDocument();
    expect(callCounts.cart).toBe(2);
  });

  it("shows an empty state with a real link back to the shop", async () => {
    setCartItemsSource([]);
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

    expect(
      await screen.findByRole("heading", { name: "Your cart is empty" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue shopping" })).toHaveAttribute(
      "href",
      "/shop"
    );
    expect(screen.getByRole("heading", { level: 1, name: "Cart" })).toBeInTheDocument();
  });

  it("marks an active hold Reserved and warns on an expired hold", async () => {
    setCartItemsSource([
      {
        id: 1,
        cart_id: 1,
        product_id: 11,
        quantity: 1,
        hold_expires_at: "2026-10-11T10:00:00.000000Z",
        hold_status: "active",
      },
      {
        id: 2,
        cart_id: 1,
        product_id: 12,
        quantity: 1,
        hold_expires_at: "2026-10-11T09:00:00.000000Z",
        hold_status: "expired",
      },
    ]);
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

    expect(await screen.findByText("Reserved")).toBeInTheDocument();
    expect(
      screen.getByText(/reservation for this item expired/i)
    ).toBeInTheDocument();
  });

  it("shows a neutral placeholder when a line's product has no image", async () => {
    setCartItemsSource([
      {
        id: 9,
        cart_id: 1,
        product_id: 14,
        quantity: 1,
        hold_expires_at: null,
        hold_status: "none",
      },
    ]);
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

    expect(await screen.findByText("No image")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HP EliteBook 840" })).toHaveAttribute(
      "href",
      "/product/hp-elitebook-840"
    );
  });

  it("updates the line total and subtotal after a quantity change, and announces it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });
    await screen.findByRole("link", { name: "Dell XPS 15" });

    const line = lineFor("Dell XPS 15");
    const quantity = within(line).getByLabelText("Quantity for Dell XPS 15");
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.tab();

    await waitFor(() =>
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("Rs. 1,990,000")
    );
    expect(callCounts.cartUpdate).toBe(1);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Cart updated.")
    );
  });

  it("shows the server stock message inline, announces it and resets the field", async () => {
    setCartUpdateError({
      status: 422,
      message: "Only 1 left in stock. Cannot set quantity to 2.",
    });
    const user = userEvent.setup();
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });
    await screen.findByRole("link", { name: "Dell XPS 15" });

    const line = lineFor("Dell XPS 15");
    await user.click(within(line).getByRole("button", { name: "Increase quantity" }));

    // The message shows BOTH inline in the line and in the live region, so the
    // inline assertion is scoped to the line; the announce is checked separately.
    expect(
      await within(lineFor("Dell XPS 15")).findByText(
        "Only 1 left in stock. Cannot set quantity to 2."
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Only 1 left in stock. Cannot set quantity to 2."
      )
    );
    expect(
      within(lineFor("Dell XPS 15")).getByLabelText("Quantity for Dell XPS 15")
    ).toHaveValue(1);
  });

  it("removes a line, updates the subtotal and announces the removal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });
    await screen.findByRole("link", { name: "Dell XPS 15" });

    await user.click(
      screen.getByRole("button", { name: "Remove Dell XPS 15 from cart" })
    );

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Dell XPS 15" })).toBeNull()
    );
    expect(callCounts.cartDelete).toBe(1);
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("Rs. 640,000");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Removed Dell XPS 15 from cart"
      )
    );
  });

  it("renders exactly one h1 in the loading, error, empty and populated states", async () => {
    // Loading (delayed response so the pending state is observable).
    server.use(
      http.get(CART_URL, async () => {
        await delay(50);
        return HttpResponse.json(cartPayload());
      })
    );
    const loading = renderWithProviders(<CartView />, { entry: "/cart" });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(
      screen.getByRole("status", { name: "Loading cart" })
    ).toBeInTheDocument();
    await loading.findByRole("link", { name: "Dell XPS 15" });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    loading.unmount();

    // Error.
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 })
      )
    );
    const error = renderWithProviders(<CartView />, { entry: "/cart" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cart unavailable"
    );
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    error.unmount();

    // Empty. server.use overrides from the earlier states in this test still
    // take precedence, so reset to the default handlers (which read the shared
    // cart source) before seeding an empty cart.
    server.resetHandlers();
    setCartItemsSource([]);
    const empty = renderWithProviders(<CartView />, { entry: "/cart" });
    expect(
      await screen.findByRole("heading", { name: "Your cart is empty" })
    ).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    empty.unmount();

    // Populated.
    setCartItemsSource(testCartItems);
    const populated = renderWithProviders(<CartView />, { entry: "/cart" });
    expect(
      await screen.findByRole("link", { name: "Dell XPS 15" })
    ).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    populated.unmount();
  });

  it("makes no requests beyond GET /cart and the PATCH under test", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });
    await screen.findByRole("link", { name: "Dell XPS 15" });

    const line = lineFor("Dell XPS 15");
    const quantity = within(line).getByLabelText("Quantity for Dell XPS 15");
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.tab();

    await waitFor(() =>
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent(
        "Rs. 1,990,000"
      )
    );

    // Wire evidence: every recorded request is the cart read (initial + the
    // post-mutation refetch) or the quantity PATCH under test — nothing else.
    const allowed = [
      /^GET \/api\/v1\/cart$/,
      /^PATCH \/api\/v1\/cart\/items\/\d+$/,
    ];
    const unexpected = recordedRequests.filter(
      (request) => !allowed.some((pattern) => pattern.test(request))
    );
    expect(unexpected).toEqual([]);
    expect(recordedRequests).toContain("GET /api/v1/cart");
    expect(recordedRequests).toContain("PATCH /api/v1/cart/items/1");
  });

  it("keeps the header badge and the subtotal consistent after a quantity change", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SiteHeader />
        <CartView />
      </>,
      { entry: "/cart", withAnnouncer: true }
    );
    await screen.findByRole("link", { name: "Dell XPS 15" });

    // The badge counts LINES from the same queryKeys.cart cache the page reads.
    expect(screen.getByRole("link", { name: "Cart, 2 items" })).toContainElement(
      screen.getByTestId("cart-count")
    );
    expect(screen.getByTestId("cart-count")).toHaveTextContent("2");
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent(
      "Rs. 1,090,000"
    );

    const line = lineFor("Dell XPS 15");
    const quantity = within(line).getByLabelText("Quantity for Dell XPS 15");
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.tab();

    await waitFor(() =>
      expect(screen.getByTestId("cart-subtotal")).toHaveTextContent(
        "Rs. 1,990,000"
      )
    );
    // One quantity edit does not add or remove a line: the badge's line count
    // and the page's subtotal must tell the same story off the same cache.
    expect(screen.getByTestId("cart-count")).toHaveTextContent("2");
    expect(
      screen.getByRole("link", { name: "Cart, 2 items" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Cart updated.")
    );
  });

  it("returns focus to the line's quantity input after a rejected quantity", async () => {
    setCartUpdateError({
      status: 422,
      message: "Only 1 left in stock. Cannot set quantity to 2.",
    });
    const user = userEvent.setup();
    renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });
    await screen.findByRole("link", { name: "Dell XPS 15" });

    await user.click(
      within(lineFor("Dell XPS 15")).getByRole("button", {
        name: "Increase quantity",
      })
    );

    // Wait for the rejection to land (inline message), then the focus must be
    // back on THAT line's quantity input, not on <body> after the reset
    // remount destroyed the button that had focus.
    expect(
      await within(lineFor("Dell XPS 15")).findByText(
        "Only 1 left in stock. Cannot set quantity to 2."
      )
    ).toBeInTheDocument();
    const input = within(lineFor("Dell XPS 15")).getByLabelText(
      "Quantity for Dell XPS 15"
    );
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input).toHaveValue(1);
  });

  describe("Reserve again (expired hold re-confirm, TASK B4-2a Step 1)", () => {
    it("re-sends the line's current quantity, renews the hold and announces", async () => {
      setCartItemsSource([
        {
          id: 5,
          cart_id: 1,
          product_id: 11,
          quantity: 2,
          hold_expires_at: "2026-10-10T10:00:00.000000Z",
          hold_status: "expired",
        },
      ]);
      const user = userEvent.setup();
      renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

      // The expired copy must point at the button that fixes it.
      expect(
        await screen.findByText(/reservation for this item expired/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Reserve again to re-confirm it/i)
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Reserve again" }));

      // The SAME current quantity went out (body recorder), not a new value...
      await waitFor(() =>
        expect(cartPatchBodies).toEqual([{ id: 5, quantity: 2 }])
      );
      // ...the cart cache was invalidated and refetched, and the renewed hold
      // came back active ("Reserved")...
      expect(await screen.findByText("Reserved")).toBeInTheDocument();
      expect(callCounts.cart).toBe(2);
      // ...and the action was announced through the site's live region.
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Reserved again."
        )
      );
    });

    it("sends a request when the quantity is unchanged and the hold is expired", async () => {
      setCartItemsSource([
        {
          id: 6,
          cart_id: 1,
          product_id: 11,
          quantity: 1,
          hold_expires_at: "2026-10-10T10:00:00.000000Z",
          hold_status: "expired",
        },
      ]);
      const user = userEvent.setup();
      renderWithProviders(<CartView />, { entry: "/cart", withAnnouncer: true });

      await user.click(
        await screen.findByRole("button", { name: "Reserve again" })
      );

      await waitFor(() => expect(callCounts.cartUpdate).toBe(1));
      expect(cartPatchBodies).toEqual([{ id: 6, quantity: 1 }]);
    });
  });
});
