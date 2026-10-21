import { http, HttpResponse } from "msw";
import type {
  Address,
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
} from "./handlers";

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

export const ADDRESSES_URL = `${API_URL}/addresses`;
export const ORDERS_URL = `${API_URL}/orders`;

/**
 * Two saved addresses, one flagged default — so a test can prove the checkout
 * form pre-selects the default and still offers the other.
 */
export const testAddresses: Address[] = [
  {
    id: 1,
    user_id: 7,
    label: "Home",
    recipient_name: "Ali Khan",
    phone: "03001234567",
    address_line_1: "12 Mall Road",
    address_line_2: "Gulberg III",
    city: "Lahore",
    postal_code: "54000",
    is_default: true,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
  },
  {
    id: 2,
    user_id: 7,
    label: "Office",
    recipient_name: "Ali Khan",
    phone: "03007654321",
    address_line_1: "8 Clifton Block 5",
    address_line_2: null,
    city: "Karachi",
    postal_code: null,
    is_default: false,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
  },
];

let addressesSource: Address[] = [...testAddresses];
let addressSequence = Math.max(...testAddresses.map((address) => address.id));

export function setAddressesSource(addresses: Address[]): void {
  addressesSource = addresses;
}

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

/** Laravel's standard validation failure body (server bootstrap/app.php). */
const validationFailed = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { message: "The given data was invalid.", errors },
    { status: 422 },
  );

/**
 * StoreAddressRequest rules, expressed as the same required/max constraints.
 * A blank string fails `required`; an over-long value fails `max` — the two
 * cases a checkout form can realistically send.
 */
function validateAddressBody(body: Record<string, unknown>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  const required = (field: string, label: string, max: number) => {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors[field] = [`The ${label} field is required.`];
    } else if (value.length > max) {
      errors[field] = [`The ${label} field must not be greater than ${max} characters.`];
    }
  };

  required("recipient_name", "recipient name", 255);
  required("phone", "phone", 20);
  required("address_line_1", "address line 1", 255);
  required("city", "city", 100);

  return errors;
}

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

export const checkoutHandlers = [
  /** GET /addresses — the user's saved addresses as a plain array. */
  http.get(ADDRESSES_URL, () => {
    callCounts.addresses += 1;
    if (!sessionGuardActive()) return unauthenticated();
    return HttpResponse.json({ addresses: addressesSource });
  }),

  /**
   * POST /addresses — 201 { address }. New addresses are NOT made default:
   * the server only changes the default via /addresses/{id}/default.
   */
  http.post(ADDRESSES_URL, async ({ request }) => {
    callCounts.addressCreate += 1;
    if (!sessionGuardActive()) return unauthenticated();

    const body = (await request.json()) as Record<string, unknown>;
    const errors = validateAddressBody(body);
    if (Object.keys(errors).length > 0) return validationFailed(errors);

    addressSequence += 1;
    const address: Address = {
      id: addressSequence,
      user_id: 7,
      label: typeof body.label === "string" ? body.label : null,
      recipient_name: String(body.recipient_name),
      phone: String(body.phone),
      address_line_1: String(body.address_line_1),
      address_line_2:
        typeof body.address_line_2 === "string" && body.address_line_2 !== ""
          ? body.address_line_2
          : null,
      city: String(body.city),
      postal_code:
        typeof body.postal_code === "string" && body.postal_code !== ""
          ? body.postal_code
          : null,
      is_default: false,
      created_at: "2026-08-25T10:00:00.000000Z",
      updated_at: "2026-08-25T10:00:00.000000Z",
    };
    addressesSource = [...addressesSource, address];

    return HttpResponse.json({ address }, { status: 201 });
  }),

  /** GET /orders — the user's orders, paginated 15/page, newest first. */
  http.get(ORDERS_URL, ({ request }) => {
    callCounts.orders += 1;
    if (!sessionGuardActive()) return unauthenticated();

    const params = new URL(request.url).searchParams;
    const perPage = 15;
    const currentPage = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const from = (currentPage - 1) * perPage;
    const data = ordersSource.slice(from, from + perPage);
    const paginator: OrdersResponse = {
      data,
      links: [],
      current_page: currentPage,
      first_page_url: null,
      from: data.length ? from + 1 : null,
      last_page: Math.max(1, Math.ceil(ordersSource.length / perPage)),
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
   * POST /orders — place an order from the cart. Body is { address_id } only.
   * Order of checks mirrors OrderService::placeOrder exactly: address
   * ownership first (404), then empty cart (422), then per-line holds (422).
   */
  http.post(ORDERS_URL, async ({ request }) => {
    callCounts.orderPlace += 1;
    if (!sessionGuardActive()) return unauthenticated();

    const body = (await request.json()) as { address_id: number };
    lastPlaceOrderBody = body;

    if (placeOrderError) {
      const { status, message } = placeOrderError;
      placeOrderError = null;
      return HttpResponse.json({ message }, { status });
    }

    const address = addressesSource.find((candidate) => candidate.id === body.address_id);
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
      user_id: 7,
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
