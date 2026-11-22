import { http, HttpResponse, delay } from "msw";
import type {
  Order,
  OrderItem,
  OrdersResponse,
} from "@ecommerce/api-client";
import { multiplyMoney, sumMoney } from "../lib/money";
import {
  API_URL,
  callCounts,
  clearCartItemsSource,
  getCartItemsSource,
  getProductDetailPool,
  getShippingFeeSource,
  session,
  testUser,
} from "./handlers";
import {
  ADDRESSES_URL,
  addressHandlers,
  getAddressesSource,
  setAddressesSource,
  testAddresses,
} from "./handlers-addresses";

/**
 * MSW handlers for the checkout slice (addresses + orders), kept in their own
 * module so the shared handlers.ts stays focused and does not grow an order/
 * address block. This file imports state and accessors FROM ./handlers — the
 * dependency runs one way only, so registering both in server.ts introduces no
 * import cycle.
 *
 * Every shape here was read off the real server, not guessed:
 * - StoreAddressRequest rules: recipient_name 255, phone 20, address_line_1
 *   255, address_line_2 nullable 255, city 100, postal_code nullable 20,
 *   label nullable 50, is_default nullable boolean.
 * - AddressController::index -> { addresses: Address[] } (a PLAIN array, not a
 *   paginator); ::store -> 201 { address }.
 * - OrderController::store -> 201 { order } with items NESTED inside order
 *   (OrderService::placeOrder eager-loads `items`); ::index -> { orders:
 *   paginator } (15/page); ::show -> { order }.
 * - Business errors carry a top-level `message` (OrderValidationException);
 *   a missing OR foreign address is the same 404 {"message":"Not Found"}.
 */

export { ADDRESSES_URL, setAddressesSource, testAddresses };
export const ORDERS_URL = `${API_URL}/orders`;

/** The user's orders, newest first — the pool GET /orders and GET /orders/:id read. */
let ordersSource: Order[] = [];
let orderSequence = 0;

export function setOrdersSource(orders: Order[]): void {
  ordersSource = orders;
  orderSequence = Math.max(0, ...orders.map((order) => order.id));
}

/**
 * The body of the MOST RECENT POST /orders, so a test can assert the exact wire
 * payload ({ address_id } only) rather than trust the client wrapper. Reset to
 * null between tests; reassigned by this module, read by setup.ts.
 */
export let lastPlaceOrderBody: { address_id: number } | null = null;

export function resetLastPlaceOrderBody(): void {
  lastPlaceOrderBody = null;
}

/**
 * Optional artificial delay (ms) applied to POST /orders, so a test can keep the
 * first request in flight while a second click is dispatched — the only window
 * in which a double-submit guard can be observed. 0 by default; reset between
 * tests by setup.ts.
 */
let placeOrderDelayMs = 0;

export function setPlaceOrderDelay(ms: number): void {
  placeOrderDelayMs = ms;
}

export function resetPlaceOrderDelay(): void {
  placeOrderDelayMs = 0;
}

/**
 * A forced failure for the NEXT POST /orders: status + message, single use.
 * `null` means the handler behaves normally. Cleared after every test.
 */
let placeOrderError: { status: number; message: string } | null = null;

export function setPlaceOrderError(
  error: { status: number; message: string } | null,
): void {
  placeOrderError = error;
}

const unauthenticated = () =>
  HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });

/** Snapshot an order line from the product pool, mirroring OrderService's copy. */
function snapshotItems(
  items: { id: number; product_id: number; quantity: number }[],
): { items: Omit<OrderItem, "id" | "order_id">[]; subtotal: string } {
  const pool = getProductDetailPool();
  const lines = items.map((item) => {
    const product = pool.find((candidate) => candidate.id === item.product_id);
    const price = product?.price ?? "0.00";
    return {
      product_id: item.product_id,
      product_name: product?.name ?? "Unknown product",
      product_sku: product?.sku ?? "UNKNOWN",
      unit_price: price,
      quantity: item.quantity,
      line_total: multiplyMoney(price, item.quantity),
    };
  });

  return {
    items: lines,
    subtotal: sumMoney(lines.map((line) => line.line_total)),
  };
}

/**
 * Optional artificial delay (ms) applied to POST /orders/:id/cancel.
 * Reset between tests by setup.ts.
 */
let cancelOrderDelayMs = 0;

export function setCancelOrderDelay(ms: number): void {
  cancelOrderDelayMs = ms;
}

export function resetCancelOrderDelay(): void {
  cancelOrderDelayMs = 0;
}

/**
 * A forced failure for the NEXT POST /orders/:id/cancel: status + message,
 * single use. `null` means the handler behaves normally. Cleared after every
 * test.
 */
let cancelOrderError: { status: number; message: string } | null = null;

export function setCancelOrderError(
  error: { status: number; message: string } | null,
): void {
  cancelOrderError = error;
}

export const checkoutHandlers = [
  ...addressHandlers,

  /** GET /orders — the user's orders, paginated 15/page, newest first. */
  http.get(ORDERS_URL, ({ request }) => {
    callCounts.orders += 1;
    if (!sessionGuardActive()) return unauthenticated();

    const params = new URL(request.url).searchParams;
    const perPage = 15;
    // Laravel's paginator does NOT clamp an out-of-range page to last_page;
    // for a page beyond the last page it returns data:[] while keeping
    // current_page unchanged (so the client can redirect to last_page).
    const currentPage = Number(params.get("page") ?? 1) || 1;
    const from = (currentPage - 1) * perPage;
    const data =
      currentPage >= 1 && from < ordersSource.length
        ? ordersSource.slice(from, from + perPage)
        : [];
    const lastPage = Math.max(1, Math.ceil(ordersSource.length / perPage));
    const paginator: OrdersResponse = {
      data,
      links: [],
      current_page: currentPage,
      first_page_url: null,
      from: data.length ? from + 1 : null,
      last_page: lastPage,
      last_page_url: null,
      next_page_url: null,
      path: ORDERS_URL,
      per_page: perPage,
      prev_page_url: null,
      to: data.length ? from + data.length : null,
      total: ordersSource.length,
    };

    return HttpResponse.json({ orders: paginator });
  }),

  /** GET /orders/:id — one owned order with items; unknown/foreign -> 404. */
  http.get(`${ORDERS_URL}/:id`, ({ params }) => {
    callCounts.orderShow += 1;
    if (!sessionGuardActive()) return unauthenticated();

    const order = ordersSource.find((candidate) => candidate.id === Number(params.id));
    if (!order) return HttpResponse.json({ message: "Not Found" }, { status: 404 });

    return HttpResponse.json({ order });
  }),

  /**
   * POST /orders/:id/cancel — customer cancels a pending order.
   *
   * Server semantics mirrored exactly:
   * - pending -> 200 { order } with status 'cancelled'; stock is restored and
   *   the order flips in the source (OrderService::cancelOrder).
   * - delivered -> 422 top-level { message: 'Cannot cancel a delivered order. Please contact support.' }
   * - cancelled  -> 422 top-level { message: 'This order has already been cancelled.' }
   * - shipped/confirmed/any non-pending non-delivered/cancelled -> 422
   *   { message: 'Only pending orders can be cancelled. Please contact support.' }
   * - unknown/foreign -> 404 {"message":"Not Found"}
   */
  http.post(`${ORDERS_URL}/:id/cancel`, async ({ params }) => {
    callCounts.orderCancel += 1;
    if (!sessionGuardActive()) return unauthenticated();

    if (cancelOrderDelayMs > 0) await delay(cancelOrderDelayMs);

    if (cancelOrderError) {
      const { status, message } = cancelOrderError;
      cancelOrderError = null;
      return HttpResponse.json({ message }, { status });
    }

    const id = Number(params.id);
    const order = ordersSource.find((candidate) => candidate.id === id);
    if (!order) return HttpResponse.json({ message: "Not Found" }, { status: 404 });

    if (order.status === "pending") {
      order.status = "cancelled";
      order.updated_at = "2026-08-25T12:00:00.000000Z";
      return HttpResponse.json({ order });
    }
    if (order.status === "delivered") {
      return HttpResponse.json(
        { message: "Cannot cancel a delivered order. Please contact support." },
        { status: 422 },
      );
    }
    if (order.status === "cancelled") {
      return HttpResponse.json(
        { message: "This order has already been cancelled." },
        { status: 422 },
      );
    }
    return HttpResponse.json(
      { message: "Only pending orders can be cancelled. Please contact support." },
      { status: 422 },
    );
  }),

  /**
   * POST /orders — place an order from the cart. Body is { address_id } only.
   * Order of checks mirrors OrderService::placeOrder exactly: address
   * ownership first (404), then empty cart (422), then per-line holds (422).
   */
  http.post(ORDERS_URL, async ({ request }) => {
    callCounts.orderPlace += 1;
    if (!sessionGuardActive()) return unauthenticated();

    if (placeOrderDelayMs > 0) await delay(placeOrderDelayMs);

    const body = (await request.json()) as { address_id: number };
    lastPlaceOrderBody = body;

    if (placeOrderError) {
      const { status, message } = placeOrderError;
      placeOrderError = null;
      return HttpResponse.json({ message }, { status });
    }

    const address = getAddressesSource().find((candidate) => candidate.id === body.address_id);
    if (!address) return HttpResponse.json({ message: "Not Found" }, { status: 404 });

    const cartItems = getCartItemsSource();
    if (cartItems.length === 0) {
      return HttpResponse.json(
        { message: "Cannot place an order with an empty cart." },
        { status: 422 },
      );
    }

    const pool = getProductDetailPool();
    const expired = cartItems.find((item) => item.hold_status === "expired");
    if (expired) {
      const name = pool.find((product) => product.id === expired.product_id)?.name ?? "This item";
      return HttpResponse.json(
        { message: `"${name}" is no longer reserved. Please re-add it to your cart.` },
        { status: 422 },
      );
    }

    const { items, subtotal } = snapshotItems(cartItems);
    const shippingFee = getShippingFeeSource();
    const total = sumMoney([subtotal, shippingFee]);

    orderSequence += 1;
    const order: Order = {
      id: orderSequence,
      order_number: `ORD-${new Date().getFullYear()}-${orderNumberSuffix(orderSequence)}`,
      user_id: testUser.id,
      address_id: address.id,
      recipient_name: address.recipient_name,
      phone: address.phone,
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2,
      city: address.city,
      postal_code: address.postal_code,
      subtotal,
      shipping_fee: shippingFee,
      total,
      status: "pending",
      payment_status: "pending",
      created_at: "2026-08-25T10:00:00.000000Z",
      updated_at: "2026-08-25T10:00:00.000000Z",
      items: items.map((line, index) => ({
        id: orderSequence * 100 + index,
        order_id: orderSequence,
        ...line,
      })),
    };
    ordersSource = [order, ...ordersSource];

    // Converting the hold to a permanent deduction empties the cart.
    clearCartItemsSource();

    return HttpResponse.json({ order }, { status: 201 });
  }),
];

/** 12 uppercase alphanumerics, matching OrderService::generateOrderNumber. */
function orderNumberSuffix(seed: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let value = seed;
  let suffix = "";
  for (let index = 0; index < 12; index += 1) {
    suffix = alphabet[(value * 31 + index * 7) % alphabet.length] + suffix;
    value = Math.floor(value / alphabet.length) + index + 1;
  }
  return suffix;
}

/**
 * The auth flag lives in ./handlers (a module-private let behind `session`).
 * Reading it here keeps the single source of truth: these handlers gate on the
 * same session every other authenticated handler does.
 */
function sessionGuardActive(): boolean {
  return session.active;
}
