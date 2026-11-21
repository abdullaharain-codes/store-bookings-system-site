import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORDERS_URL,
  setOrdersSource,
  setCancelOrderError,
} from "../../test/handlers-checkout";
import { session } from "../../test/handlers";
import type { Order } from "@ecommerce/api-client";
import { server, recordedRequests } from "../../test/server";
import { createTestQueryClient, renderWithProviders } from "../../test/utils";
import { OrderDetailView } from "./OrderDetailView";

/** A fully-populated order, exactly as GET /orders/:id returns it. */
const PLACED_ORDER: Order = {
  id: 1,
  order_number: "ORD-2026-ABC123XYZ789",
  user_id: 7,
  address_id: 1,
  recipient_name: "Ali Khan",
  phone: "03001234567",
  address_line_1: "12 Mall Road",
  address_line_2: "Gulberg III",
  city: "Lahore",
  postal_code: "54000",
  subtotal: "900000.00",
  shipping_fee: "200.00",
  total: "900200.00",
  status: "confirmed",
  payment_status: "pending",
  created_at: "2026-10-20T14:30:00.000000Z",
  updated_at: "2026-10-20T14:30:00.000000Z",
  items: [
    {
      id: 101,
      order_id: 1,
      product_id: 1,
      product_name: "Dell XPS 15",
      product_sku: "DXPS15",
      unit_price: "450000.00",
      quantity: 2,
      line_total: "900000.00",
    },
  ],
};

function signIn() {
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

describe("OrderDetailView", () => {
  beforeEach(() => {
    signIn();
    session.start();
    setOrdersSource([PLACED_ORDER]);
  });

  afterEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isSessionChecked: false,
    });
  });

  it("renders exactly one h1 with the order number and sets the title", async () => {
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: `Order ORD-2026-ABC123XYZ789`,
      })
    ).toBeInTheDocument();
    expect(h1Count()).toBe(1);
    await waitFor(() =>
      expect(document.title).toBe("Order ORD-2026-ABC123XYZ789 | TechFix")
    );
  });

  it("renders every money figure from the SERVER's strings, not recomputed", async () => {
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(await screen.findByTestId("order-subtotal")).toHaveTextContent(
      "Rs. 900,000"
    );
    expect(screen.getByTestId("order-shipping")).toHaveTextContent("Rs. 200");
    expect(screen.getByTestId("order-total")).toHaveTextContent("Rs. 900,200");
  });

  it("shows the item snapshot, the address snapshot and COD", async () => {
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(await screen.findByText("Dell XPS 15")).toBeInTheDocument();
    // The address renders as one composed line ("12 Mall Road, Gulberg III,
    // Lahore 54000"), so match the substring rather than the exact node.
    expect(
      screen.getByText(/12 Mall Road/)
    ).toBeInTheDocument();
    expect(screen.getAllByText("Cash on delivery").length).toBeGreaterThan(0);
  });

  it("shows human status/payment labels", async () => {
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("falls back to the raw value for an unknown status", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "awaiting_pickup" }]);
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(await screen.findByText("awaiting_pickup")).toBeInTheDocument();
  });

  it("shows the placed banner only when ?placed=1", async () => {
    const { unmount } = renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });
    // Wait for the POPULATED state (the loading state renders an sr-only h1
    // too, so a bare heading query would assert against the skeleton).
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Order ORD-2026-ABC123XYZ789",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Thank you — your order has been placed")
    ).toBeNull();
    unmount();

    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1?placed=1",
      withAnnouncer: true,
    });
    expect(
      await screen.findByText("Thank you — your order has been placed")
    ).toBeInTheDocument();
  });

  it("renders DetailNotFound (one h1, noindex) on a 404", async () => {
    server.use(
      http.get(`${ORDERS_URL}/:id`, () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 })
      )
    );
    renderWithProviders(<OrderDetailView orderId={999} />, {
      entry: "/account/orders/999",
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Order not found" })
    ).toBeInTheDocument();
    expect(h1Count()).toBe(1);
    expect(
      document.querySelector('meta[name="robots"]')
    ).toHaveAttribute("content", "noindex");
  });

  it("renders an ErrorState with a Try again action on a 500", async () => {
    server.use(
      http.get(`${ORDERS_URL}/:id`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(
      (await screen.findAllByText("Order unavailable")).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
    expect(h1Count()).toBe(1);
  });

  it("shows a loading status while the order is fetched", async () => {
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(h1Count()).toBe(1);
  });

  it.each([
    ["NaN", Number("abc")],
    ["zero", 0],
    ["negative", -1],
  ])(
    "renders the not-found state immediately for a %s id, with NO request",
    async (_label, id) => {
      renderWithProviders(<OrderDetailView orderId={id} />, {
        entry: "/account/orders/0",
      });

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "Order not found",
        })
      ).toBeInTheDocument();
      expect(h1Count()).toBe(1);
      // No endless skeleton and no network attempt for a bogus id.
      expect(screen.queryByRole("status")).toBeNull();
      expect(
        recordedRequests.some((r) => r.startsWith("GET /api/v1/orders/"))
      ).toBe(false);
    }
  );

  it("shows Cancel order only when status is pending (and it was present before cancel)", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "pending" }]);
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
      withAnnouncer: true,
    });

    const cancelButton = await screen.findByRole("button", {
      name: /cancel order/i,
    });
    expect(cancelButton).toBeInTheDocument();

    await user.click(cancelButton);
    // The confirm dialog repeats the action label; click the CONFIRM one.
    const confirmButtons = await screen.findAllByRole("button", {
      name: /cancel order/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /cancel order/i })
      ).toBeNull()
    );
    expect(await screen.findByText("Order cancelled")).toBeInTheDocument();
  });

  it.each([
    ["confirmed", "confirmed"],
    ["shipped", "shipped"],
    ["delivered", "delivered"],
    ["cancelled", "cancelled"],
  ])("does not show Cancel order when status is %s", async (_label, status) => {
    setOrdersSource([{ ...PLACED_ORDER, status }]);
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    // Wait for the POPULATED state first (the loading state also renders an
    // sr-only h1, so a bare heading query would assert against the skeleton).
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Order ORD-2026-ABC123XYZ789",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel order/i })
    ).toBeNull();
  });

  it("422 shows the SERVER message via api-error (non-pending message)", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "pending" }]);
    setCancelOrderError({
      status: 422,
      message: "Only pending orders can be cancelled. Please contact support.",
    });
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
      withAnnouncer: true,
    });

    await user.click(await screen.findByRole("button", { name: /cancel order/i }));
    const confirmButtons = await screen.findAllByRole("button", {
      name: /cancel order/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Only pending orders can be cancelled. Please contact support."
      )
    );
  });

  it("404 on cancel shows DetailNotFound behaviour", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "pending" }]);
    server.use(
      http.post(`${ORDERS_URL}/:id/cancel`, () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
    });

    await user.click(await screen.findByRole("button", { name: /cancel order/i }));
    const confirmButtons = await screen.findAllByRole("button", {
      name: /cancel order/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Order not found" })
    ).toBeInTheDocument();
  });

  it("[MUTATE] invalidates the ['orders'] family after a cancel, so a stale list/detail refetches", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "pending" }]);
    const queryClient = createTestQueryClient();
    const invalidatedKeys: unknown[] = [];
    const spy = vi.spyOn(queryClient, "invalidateQueries").mockImplementation(
      (filters) => {
        invalidatedKeys.push(filters?.queryKey);
        return Promise.resolve();
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
      queryClient,
      withAnnouncer: true,
    });

    await user.click(await screen.findByRole("button", { name: /cancel order/i }));
    const confirmButtons = await screen.findAllByRole("button", {
      name: /cancel order/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(invalidatedKeys).toContainEqual(["orders"])
    );
    spy.mockRestore();
  });

  it("[MUTATE] a cancelled order refetches the detail and renders it as cancelled", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "pending" }]);
    const queryClient = createTestQueryClient();
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
      queryClient,
      withAnnouncer: true,
    });

    await user.click(await screen.findByRole("button", { name: /cancel order/i }));
    const confirmButtons = await screen.findAllByRole("button", {
      name: /cancel order/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    // The server flipped the order to cancelled; the refetched detail shows it.
    await waitFor(() => expect(screen.getByText("Cancelled")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: /cancel order/i })
    ).toBeNull();
  });

  it("a 401 on cancel drops the session so the require-auth guard sends the shopper to /login", async () => {
    setOrdersSource([{ ...PLACED_ORDER, status: "pending" }]);
    server.use(
      http.post(`${ORDERS_URL}/:id/cancel`, () =>
        HttpResponse.json({ message: "Unauthenticated." }, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<OrderDetailView orderId={1} />, {
      entry: "/account/orders/1",
      withAnnouncer: true,
    });

    await user.click(await screen.findByRole("button", { name: /cancel order/i }));
    const confirmButtons = await screen.findAllByRole("button", {
      name: /cancel order/i,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    );
    expect(useAuthStore.getState().user).toBeNull();
  });
});
