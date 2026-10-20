import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet, post: mockPost },
}));

import { cancelOrder, getOrder, listOrders, placeOrder } from "./order";
import type { Order, OrdersResponse } from "./order";

const order: Order = {
  id: 1,
  order_number: "ORD-2026-A1B2C3D4E5F6",
  user_id: 4,
  address_id: 2,
  recipient_name: "Ali",
  phone: "03001234567",
  address_line_1: "12 Street Road",
  address_line_2: null,
  city: "Lahore",
  postal_code: "54000",
  subtotal: "120000.00",
  shipping_fee: "200.00",
  total: "120200.00",
  status: "pending",
  payment_status: "pending",
  items: [],
};

const ordersResponse: OrdersResponse = {
  data: [order],
  links: [],
  current_page: 1,
  first_page_url: null,
  from: 1,
  last_page: 1,
  last_page_url: null,
  next_page_url: null,
  path: "/api/v1/orders",
  per_page: 15,
  prev_page_url: null,
  to: 1,
  total: 1,
};

describe("order", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("placeOrder posts address_id to /orders and returns the order envelope", async () => {
    mockPost.mockResolvedValue({ data: { order } });

    const result = await placeOrder(2);

    expect(mockPost).toHaveBeenCalledWith("/orders", { address_id: 2 });
    expect(result).toEqual({ order });
  });

  it("listOrders calls /orders and returns the paginated orders envelope", async () => {
    mockGet.mockResolvedValue({ data: { orders: ordersResponse } });

    const result = await listOrders();

    expect(mockGet).toHaveBeenCalledWith("/orders");
    expect(result).toEqual({ orders: ordersResponse });
  });

  it("getOrder calls the interpolated URL and returns the order envelope", async () => {
    mockGet.mockResolvedValue({ data: { order } });

    const result = await getOrder(1);

    expect(mockGet).toHaveBeenCalledWith("/orders/1");
    expect(result).toEqual({ order });
  });

  it("cancelOrder posts the interpolated cancel URL and returns the order envelope", async () => {
    mockPost.mockResolvedValue({ data: { order } });

    const result = await cancelOrder(1);

    expect(mockPost).toHaveBeenCalledWith("/orders/1/cancel");
    expect(result).toEqual({ order });
  });
});