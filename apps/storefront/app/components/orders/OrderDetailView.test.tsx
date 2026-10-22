import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ORDERS_URL, setOrdersSource } from "../../test/handlers-checkout";
import { session } from "../../test/handlers";
import type { Order } from "@ecommerce/api-client";
import { server, recordedRequests } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
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
    expect(
      await screen.findByRole("heading", { level: 1 })
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
});
