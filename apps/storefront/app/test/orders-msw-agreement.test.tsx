import { describe, expect, it } from "vitest";
import { cancelOrder, listOrders } from "@ecommerce/api-client";
import { session } from "./handlers";
import { setOrdersSource, testAddresses } from "./handlers-checkout";
import { recordedRequests } from "./server";
import type { Order } from "@ecommerce/api-client";

function pendingOrder(id: number): Order {
  return {
    id,
    order_number: `ORD-2026-TEST${id}`,
    user_id: 4,
    address_id: testAddresses[0].id,
    recipient_name: testAddresses[0].recipient_name,
    phone: testAddresses[0].phone,
    address_line_1: testAddresses[0].address_line_1,
    address_line_2: testAddresses[0].address_line_2,
    city: testAddresses[0].city,
    postal_code: testAddresses[0].postal_code,
    subtotal: "45000.00",
    shipping_fee: "200.00",
    total: "45200.00",
    status: "pending",
    payment_status: "pending",
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
    items: [],
  };
}

describe("orders MSW agreement with the real api-client", () => {
  it("listOrders() hits GET /orders and returns {orders: paginator} with no page param when undefined", async () => {
    session.start();
    setOrdersSource([pendingOrder(1), pendingOrder(2)]);

    const result = await listOrders();

    expect(recordedRequests).toContain("GET /api/v1/orders");
    expect(result.orders.data.length).toBe(2);
    expect(result.orders.current_page).toBe(1);
  });

  it("listOrders(2) sends ?page=2 and the MSW returns the page slice (newest first preserved)", async () => {
    session.start();
    const orders = Array.from({ length: 16 }, (_, i) => pendingOrder(i + 1));
    setOrdersSource(orders);

    const result = await listOrders(2);

    expect(recordedRequests).toContain("GET /api/v1/orders");
    // page 2 should start after first 15
    expect(result.orders.current_page).toBe(2);
    expect(result.orders.data.length).toBe(1);
  });

  it("GET /orders out of range returns data:[] with current_page preserved (no clamp)", async () => {
    session.start();
    setOrdersSource([pendingOrder(1)]);

    const result = await listOrders(99);

    expect(result.orders.current_page).toBe(99);
    expect(result.orders.data).toEqual([]);
    expect(result.orders.total).toBe(1);
  });

  it("cancelOrder() posts to /orders/:id/cancel, flips pending->cancelled, returns {order}", async () => {
    session.start();
    setOrdersSource([pendingOrder(7)]);

    const result = await cancelOrder(7);

    expect(recordedRequests).toContain("POST /api/v1/orders/7/cancel");
    expect(result.order.status).toBe("cancelled");
  });

  it("cancelOrder() on delivered returns 422 with the real server message", async () => {
    session.start();
    const delivered: Order = { ...pendingOrder(8), status: "delivered" };
    setOrdersSource([delivered]);

    await expect(cancelOrder(8)).rejects.toMatchObject({
      response: {
        status: 422,
        data: {
          message:
            "Cannot cancel a delivered order. Please contact support.",
        },
      },
    });
  });

  it("cancelOrder() on already-cancelled returns 422 with the real server message", async () => {
    session.start();
    const cancelled: Order = { ...pendingOrder(9), status: "cancelled" };
    setOrdersSource([cancelled]);

    await expect(cancelOrder(9)).rejects.toMatchObject({
      response: {
        status: 422,
        data: {
          message: "This order has already been cancelled.",
        },
      },
    });
  });

  it("cancelOrder() on confirmed returns 422 with the generic non-pending message", async () => {
    session.start();
    const confirmed: Order = { ...pendingOrder(10), status: "confirmed" };
    setOrdersSource([confirmed]);

    await expect(cancelOrder(10)).rejects.toMatchObject({
      response: {
        status: 422,
        data: {
          message: "Only pending orders can be cancelled. Please contact support.",
        },
      },
    });
  });

  it("cancelOrder() on foreign/missing returns 404 with {message:'Not Found'}", async () => {
    session.start();
    setOrdersSource([]);

    await expect(cancelOrder(999)).rejects.toMatchObject({
      response: {
        status: 404,
        data: { message: "Not Found" },
      },
    });
  });
});
