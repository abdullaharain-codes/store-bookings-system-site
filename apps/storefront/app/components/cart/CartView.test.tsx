import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CartView } from "./CartView";
import {
  CART_URL,
  callCounts,
  session,
  setCartItemsSource,
  setCartUpdateError,
  testCartItems,
  testProductDetails,
  testUser,
} from "../../test/handlers";
import { server } from "../../test/server";
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
});
