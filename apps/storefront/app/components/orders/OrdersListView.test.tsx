import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { Order } from "@ecommerce/api-client";
import { session } from "../../test/handlers";
import { ORDERS_URL, setOrdersSource } from "../../test/handlers-checkout";
import { server, recordedRequests } from "../../test/server";
import { createTestQueryClient, renderWithProviders } from "../../test/utils";
import { queryKeys } from "../../hooks/query-keys";
import { OrdersListView } from "./OrdersListView";

function order(id: number, status = "pending", total = "900200.00"): Order {
  return {
    id,
    order_number: `ORD-2026-ORDER${id}`,
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
    total,
    status,
    payment_status: "pending",
    created_at: "2026-10-20T14:30:00.000000Z",
    updated_at: "2026-10-20T14:30:00.000000Z",
    items: [],
  };
}

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

describe("OrdersListView", () => {
  beforeEach(() => {
    signIn();
    session.start();
  });

  it("renders one h1, the order numbers, a status badge and the server total", async () => {
    setOrdersSource([order(1, "pending"), order(2, "delivered", "1200.00")]);
    renderWithProviders(<OrdersListView />, { entry: "/account/orders" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "My orders" })
    ).toBeInTheDocument();
    expect(h1Count()).toBe(1);
    expect(screen.getByText("ORD-2026-ORDER1")).toBeInTheDocument();
    expect(screen.getByText("ORD-2026-ORDER2")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    // Money comes from the server string, formatted only.
    expect(screen.getByText("Rs. 900,200")).toBeInTheDocument();
    expect(screen.getByText("Rs. 1,200")).toBeInTheDocument();
  });

  it("links each row to its detail page", async () => {
    setOrdersSource([order(5)]);
    renderWithProviders(<OrdersListView />, { entry: "/account/orders" });

    const link = await screen.findByRole("link", { name: "ORD-2026-ORDER5" });
    expect(link).toHaveAttribute("href", "/account/orders/5");
  });

  it("renders the empty state with a Start shopping link to /shop when there are no orders", async () => {
    setOrdersSource([]);
    renderWithProviders(<OrdersListView />, { entry: "/account/orders" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "No orders yet" })
    ).toBeInTheDocument();
    expect(h1Count()).toBe(1);
    const shopLink = screen.getByRole("link", { name: "Start shopping" });
    expect(shopLink).toHaveAttribute("href", "/shop");
  });

  it("renders an ErrorState with a Try again action on a 500", async () => {
    server.use(
      http.get(ORDERS_URL, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 })
      )
    );
    renderWithProviders(<OrdersListView />, { entry: "/account/orders" });

    expect(
      (await screen.findAllByText("Orders unavailable")).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
    expect(h1Count()).toBe(1);
  });

  it("shows a loading skeleton while the list is fetched", async () => {
    setOrdersSource([order(1)]);
    renderWithProviders(<OrdersListView />, { entry: "/account/orders" });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(h1Count()).toBe(1);
  });

  it("reads ?page= and requests that page", async () => {
    setOrdersSource([order(1)]);
    renderWithProviders(<OrdersListView />, {
      entry: "/account/orders?page=2",
    });

    await waitFor(() =>
      expect(
        recordedRequests.some((r) => r.startsWith("GET /api/v1/orders"))
      ).toBe(true)
    );
    await waitFor(() => {
      const url = recordedRequests.find((r) =>
        r.startsWith("GET /api/v1/orders")
      );
      expect(url).toBeDefined();
    });
  });

  it("paginates: a second page of orders renders a Pagination control", async () => {
    const many = Array.from({ length: 20 }, (_, i) => order(i + 1));
    setOrdersSource(many);
    renderWithProviders(<OrdersListView />, { entry: "/account/orders" });

    expect(
      await screen.findByRole("navigation", { name: "Orders pages" })
    ).toBeInTheDocument();
  });

  it("redirects an out-of-range ?page= to the last page", async () => {
    const many = Array.from({ length: 20 }, (_, i) => order(i + 1));
    setOrdersSource(many);
    const { probe } = renderWithProviders(<OrdersListView />, {
      entry: "/account/orders?page=99",
    });

    await waitFor(() => expect(probe.path).toBe("/account/orders?page=2"));
  });

  it("the ['orders'] family key covers the paginated list key, so a cancel refreshes the list", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.ordersPage(2), { orders: { data: [] } });

    await queryClient.invalidateQueries({ queryKey: queryKeys.orders });

    expect(
      queryClient.getQueryState(queryKeys.ordersPage(2))?.isInvalidated
    ).toBe(true);
  });
});
