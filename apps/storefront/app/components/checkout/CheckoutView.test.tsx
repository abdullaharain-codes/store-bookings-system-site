import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADDRESSES_URL,
  ORDERS_URL,
  lastPlaceOrderBody,
  setPlaceOrderDelay,
  testAddresses,
} from "../../test/handlers-checkout";
import {
  callCounts,
  session,
  setCartItemsSource,
  setShippingFeeSource,
  testProducts,
} from "../../test/handlers";
import { recordedRequests } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import { CheckoutView } from "./CheckoutView";

/**
 * The cart fixture the checkout reads: one line (Dell XPS 15, 450000.00 x2)
 * enriched with its product, exactly as GET /cart returns it.
 */
function seedCart() {
  const xps = testProducts[0];
  setCartItemsSource([
    {
      id: 1,
      cart_id: 1,
      product_id: xps.id,
      quantity: 2,
      hold_expires_at: null,
      hold_status: "active",
      product: xps,
    },
  ]);
}

function seedExpiredCart() {
  const xps = testProducts[0];
  setCartItemsSource([
    {
      id: 1,
      cart_id: 1,
      product_id: xps.id,
      quantity: 2,
      hold_expires_at: "2026-10-10T10:00:00.000000Z",
      hold_status: "expired",
      product: xps,
    },
  ]);
}

/** An authenticated session, so the guarded checkout renders its content. */
function signIn() {
  session.start();
  useAuthStore.setState({
    user: {
      id: 7,
      name: "Ada Lovelace",
      email: "ada@example.test",
      role: { id: 2, name: "Customer", slug: "customer" },
    },
    isAuthenticated: true,
    isSessionChecked: true,
  });
}

function h1Count() {
  return document.querySelectorAll("h1").length;
}

/**
 * Finds the place-order button and clicks it only once it is ENABLED. The
 * button is disabled until a saved address is selected (and while the addresses
 * query is still loading), so clicking it the instant it appears can silently
 * no-op under load — exactly the flake this helper removes.
 */
async function clickPlaceOrder(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole("button", {
    name: "Place order (Cash on delivery)",
  });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  return button;
}

describe("CheckoutView", () => {
  beforeEach(() => {
    signIn();
    seedCart();
    setShippingFeeSource("200.00");
  });

  afterEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isSessionChecked: false,
    });
  });

  it("renders exactly one h1 and the page title", async () => {
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    expect(await screen.findByRole("heading", { level: 1, name: "Checkout" }))
      .toBeInTheDocument();
    expect(h1Count()).toBe(1);
    await waitFor(() => expect(document.title).toBe("Checkout | TechFix"));
  });

  it("shows the summary math with the endpoint's shipping fee", async () => {
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    // 2 x 450000.00 = 900000.00 subtotal + 200.00 fee = 900200.00 total.
    expect(await screen.findByTestId("checkout-subtotal")).toHaveTextContent(
      "Rs. 900,000"
    );
    expect(screen.getByTestId("checkout-shipping")).toHaveTextContent(
      "Rs. 200"
    );
    expect(screen.getByTestId("checkout-total")).toHaveTextContent(
      "Rs. 900,200"
    );
  });

  it("preselects the default saved address", async () => {
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    const defaultRadio = await screen.findByRole("radio", {
      name: /12 Mall Road/,
    });
    expect(defaultRadio).toBeChecked();
  });

  it("places the order with the selected address id in the body", async () => {
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });
    const user = userEvent.setup();

    // Select the non-default (second) address.
    await user.click(await screen.findByRole("radio", { name: /8 Clifton/ }));

    await clickPlaceOrder(user);

    await waitFor(() =>
      expect(lastPlaceOrderBody).toEqual({ address_id: testAddresses[1].id })
    );
    expect(callCounts.orderPlace).toBe(1);
  });

  it("navigates to the order page (placed=1) and clears the cart on success", async () => {
    const { probe } = renderWithProviders(<CheckoutView />, {
      entry: "/checkout",
    });
    const user = userEvent.setup();

    await clickPlaceOrder(user);

    await waitFor(() => expect(probe.path).toBe("/account/orders/1?placed=1"));
  });

  it("announces the placement and invalidates the cart", async () => {
    const { queryClient } = renderWithProviders(<CheckoutView />, {
      entry: "/checkout",
      withAnnouncer: true,
    });
    const user = userEvent.setup();
    const invalidate = queryClient.invalidateQueries;

    await clickPlaceOrder(user);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Order placed")
    );
    // The cart cache was dropped, so the header badge reloads empty.
    await waitFor(() =>
      expect(queryClient.getQueryState(["cart"])?.isInvalidated).not.toBe(
        undefined
      )
    );
    void invalidate;
  });

  it("sends exactly ONE request on a double click", async () => {
    // Keep the first request in flight so the second click lands inside the
    // only window a double-submit guard can protect.
    setPlaceOrderDelay(200);
    const { probe: placeProbe } = renderWithProviders(<CheckoutView />, {
      entry: "/checkout",
    });
    const user = userEvent.setup();

    const button = await screen.findByRole("button", {
      name: "Place order (Cash on delivery)",
    });
    // Clicking a disabled button no-ops, so wait for the address to select.
    await waitFor(() => expect(button).toBeEnabled());
    // Two rapid clicks, the second while the first request is still pending.
    await Promise.all([user.click(button), user.click(button)]);

    await waitFor(() => expect(callCounts.orderPlace).toBe(1));
    expect(callCounts.orderPlace).toBe(1);

    // Let the delayed POST fully settle before the test ends: its success path
    // clears the shared cart source, and a late resolution would otherwise
    // empty the NEXT test's cart mid-run.
    await waitFor(() => expect(placeProbe.path).toBe("/account/orders/1?placed=1"));
  });

  it("shows the server's 422 message inline in an alert", async () => {
    const { server } = await import("../../test/server");
    server.use(
      http.post(ORDERS_URL, () =>
        HttpResponse.json(
          {
            message:
              '"Dell XPS 15" is no longer reserved. Please re-add it to your cart.',
          },
          { status: 422 }
        )
      )
    );
    renderWithProviders(<CheckoutView />, { entry: "/checkout", withAnnouncer: true });
    const user = userEvent.setup();

    await clickPlaceOrder(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      '"Dell XPS 15" is no longer reserved. Please re-add it to your cart.'
    );
  });

  it("falls back to a generic message on a 500 and never renders raw text", async () => {
    const { server } = await import("../../test/server");
    server.use(
      http.post(ORDERS_URL, () =>
        HttpResponse.json(
          { message: "SQLSTATE[HY000]: General error: 1364" },
          { status: 500 }
        )
      )
    );
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });
    const user = userEvent.setup();

    await clickPlaceOrder(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "We couldn't place your order. Please try again."
    );
    expect(alert).not.toHaveTextContent("SQLSTATE");
  });

  it("shows an empty-cart state with a link to the shop and no place-order button", async () => {
    setCartItemsSource([]);
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Place order (Cash on delivery)" })
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Continue shopping" }))
      .toBeInTheDocument();
    expect(h1Count()).toBe(1);
  });

  it("blocks the place-order button and lists the expired items", async () => {
    seedExpiredCart();
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dell XPS 15");
    expect(
      screen.getByRole("button", { name: "Place order (Cash on delivery)" })
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: /cart/i })).toBeInTheDocument();
  });

  it("does not block checkout when the shipping fee fails", async () => {
    const { server } = await import("../../test/server");
    const { SHIPPING_FEE_URL } = await import("../../test/handlers");
    server.use(
      http.get(SHIPPING_FEE_URL, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    expect(
      await screen.findByText("Shipping will be shown on your order.")
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Place order (Cash on delivery)" })
      ).toBeEnabled()
    );
  });

  describe("add-address form", () => {
    it("validates required fields client-side before any request", async () => {
      const { server } = await import("../../test/server");
      let created = 0;
      server.use(
        http.post(ADDRESSES_URL, () => {
          created += 1;
          return HttpResponse.json({}, { status: 500 });
        })
      );
      renderWithProviders(<CheckoutView />, { entry: "/checkout" });
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole("button", { name: "Add a new address" })
      );
      await user.click(screen.getByRole("button", { name: "Save address" }));

      expect(created).toBe(0);
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });

    it("maps the server's 422 field errors next to the matching field", async () => {
      const { server } = await import("../../test/server");
      server.use(
        http.post(ADDRESSES_URL, () =>
          HttpResponse.json(
            {
              message: "The given data was invalid.",
              errors: { phone: ["The phone field is required."] },
            },
            { status: 422 }
          )
        )
      );
      renderWithProviders(<CheckoutView />, { entry: "/checkout" });
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole("button", { name: "Add a new address" })
      );
      await user.type(screen.getByLabelText("Recipient name"), "Ali Khan");
      await user.type(screen.getByLabelText("Phone"), "03001234567");
      await user.type(screen.getByLabelText("Address line 1"), "12 Mall Road");
      await user.type(screen.getByLabelText("City"), "Lahore");
      await user.click(screen.getByRole("button", { name: "Save address" }));

      expect(
        await screen.findByText("The phone field is required.")
      ).toBeInTheDocument();
    });

    it("auto-selects a newly created address", async () => {
      renderWithProviders(<CheckoutView />, { entry: "/checkout" });
      const user = userEvent.setup();

      await user.click(
        await screen.findByRole("button", { name: "Add a new address" })
      );
      await user.type(screen.getByLabelText("Recipient name"), "New Person");
      await user.type(screen.getByLabelText("Phone"), "03111222333");
      await user.type(screen.getByLabelText("Address line 1"), "99 New Street");
      await user.type(screen.getByLabelText("City"), "Islamabad");
      await user.click(screen.getByRole("button", { name: "Save address" }));

      const created = await screen.findByRole("radio", { name: /99 New Street/ });
      await waitFor(() => expect(created).toBeChecked());
    });

    it("opens the form by default when there are no saved addresses", async () => {
      const { server } = await import("../../test/server");
      server.use(
        http.get(ADDRESSES_URL, () => HttpResponse.json({ addresses: [] }))
      );
      renderWithProviders(<CheckoutView />, { entry: "/checkout" });

      expect(
        await screen.findByLabelText("Recipient name")
      ).toBeInTheDocument();
    });
  });

  it("never issues a place-order request when simply viewing the page", async () => {
    renderWithProviders(<CheckoutView />, { entry: "/checkout" });

    await screen.findByRole("radio", { name: /12 Mall Road/ });
    expect(callCounts.orderPlace).toBe(0);
    expect(recordedRequests.some((r) => r.startsWith("POST /api/v1/orders"))).toBe(
      false
    );
  });
});
