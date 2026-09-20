/**
 * Typed wrappers around the customer order endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\OrderController exactly:
 * - POST   /orders          -> { order: Order }       (201)
 * - GET    /orders          -> { orders: Paginated }
 * - GET    /orders/{id}     -> { order: Order }
 * - POST   /orders/{id}/cancel -> { order: Order }
 */
import apiClient from "./api-client";
import type { Paginator } from "./catalog";

// ─── Entity types ───────────────────────────────────────────────────────────

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  unit_price: string;
  quantity: number;
  line_total: string;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  address_id: number;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  postal_code: string | null;
  subtotal: string;
  shipping_fee: string;
  total: string;
  status: string;
  payment_status: string;
  created_at?: string;
  updated_at?: string;
  items?: OrderItem[];
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface OrderResponse {
  order: Order;
}

export type OrdersResponse = Paginator<Order>;

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** Place an order from the user's current cart. */
export async function placeOrder(addressId: number): Promise<OrderResponse> {
  const { data } = await apiClient.post<OrderResponse>("/orders", {
    address_id: addressId,
  });
  return data;
}

/** List the authenticated user's orders (paginated). */
export async function listOrders(): Promise<{ orders: OrdersResponse }> {
  const { data } = await apiClient.get<{ orders: OrdersResponse }>("/orders");
  return data;
}

/** Get a single order with its items. */
export async function getOrder(orderId: number): Promise<OrderResponse> {
  const { data } = await apiClient.get<OrderResponse>(`/orders/${orderId}`);
  return data;
}

/** Cancel a pending order. */
export async function cancelOrder(orderId: number): Promise<OrderResponse> {
  const { data } = await apiClient.post<OrderResponse>(
    `/orders/${orderId}/cancel`,
  );
  return data;
}
