import { describe, expect, it } from "vitest";
import {
  createAddress,
  getAddresses,
  getOrder,
  getProducts,
  listOrders,
  placeOrder,
} from "@ecommerce/api-client";
import {
  callCounts,
  getCartItemsSource,
  session,
  setCartItemsSource,
} from "./handlers";
import {
  ADDRESSES_URL,
  ORDERS_URL,
  lastPlaceOrderBody,
  setOrdersSource,
  setPlaceOrderError,
  testAddresses,
} from "./handlers-checkout";
import { recordedRequests } from "./server";

/**
 * These exercise the REAL api-client functions against the REAL MSW handlers,
 * so they prove the two agree on the wire — the same reasoning as
 * handlers.test.ts. A unit test with a mocked client cannot catch a field name
 * or an envelope key the client and server disagree about.
 *
 * The address/order contract was cross-checked against the server first:
 * StoreAddressRequest rules, the addresses/orders/order_items migrations,
 * AddressController/OrderController, and OrderApiTest's assertions.
 */
const addressPayload = {
  recipient_name: "Ali Khan",
  phone: "03001234567",
  address_line_1: "12 Mall Road",
  city: "Lahore",
};

describe("addresses handler", () => {
  it("requires a session, like the real auth:sanctum route", async () => {
    await expect(getAddresses()).rejects.toMatchObject({ response: { status: 401 } });
    expect(callCounts.addresses).toBe(1);
  });

  it("returns the plain-array addresses envelope", async () => {
    session.start();

    const result = await getAddresses();

    expect(callCounts.addresses).toBe(1);
    expect(result.addresses).toHaveLength(2);
    expect(result.addresses[0].recipient_name).toBe("Ali Khan");
    expect(result.addresses.some((address) => address.is_default)).toBe(true);
  });

  it("creates an address with 201 and the { address } envelope", async () => {
    session.start();

    const result = await createAddress(addressPayload);

    expect(callCounts.addressCreate).toBe(1);
    expect(result.address.id).toBeGreaterThan(0);
    expect(result.address.recipient_name).toBe("Ali Khan");
    expect(result.address.city).toBe("Lahore");
    // Newly-created addresses are NOT automatically default (the server only
    // changes the default through POST /addresses/{id}/default).
    expect(result.address.is_default).toBe(false);
    // The new address is visible on the next list call.
    const list = await getAddresses();
    expect(list.addresses.map((address) => address.id)).toContain(result.address.id);
  });

  it("rejects a missing required field with 422 and a field errors bag", async () => {
    session.start();

    await expect(createAddress({ ...addressPayload, city: "" })).rejects.toMatchObject({
      response: {
        status: 422,
        data: { errors: { city: expect.any(Array) } },
      },
    });
  });

  it("rejects a blank body with 422 naming the real required fields", async () => {
    session.start();

    try {
      await createAddress({
        recipient_name: "",
        phone: "",
        address_line_1: "",
        city: "",
      });
      throw new Error("expected a 422");
    } catch (error) {
      const data = (error as { response: { data: { errors: Record<string, string[]> } } })
        .response.data;
      expect(Object.keys(data.errors).sort()).toEqual([
        "address_line_1",
        "city",
        "phone",
        "recipient_name",
      ]);
    }
  });
});

describe("orders handler", () => {
  it("places an order from the cart with the exact body, then empties the cart", async () => {
    session.start();
    const addressId = testAddresses[0].id;

    const result = await placeOrder(addressId);

    expect(callCounts.orderPlace).toBe(1);
    // Wire evidence: the client sent exactly { address_id } — no address fields,
    // no payment_method (COD only, the server reads the fee itself).
    expect(lastPlaceOrderBody).toEqual({ address_id: addressId });

    // The order mirrors OrderController::store — items NESTED inside `order`.
    expect(result.order.address_id).toBe(addressId);
    expect(result.order.order_number).toMatch(/^ORD-\d{4}-[A-Z0-9]{12}$/);
    expect(result.order.status).toBe("pending");
    expect(result.order.payment_status).toBe("pending");
    expect(result.order.items).toHaveLength(2);

    // Totals: subtotal + the SAME flat fee GET /shipping-fee serves. The
    // default cart is 1x Dell XPS 15 (450000.00) + 2x HP Spectre x360
    // (320000.00) = 1,090,000.00 subtotal + 200.00 fee.
    expect(result.order.shipping_fee).toBe("200.00");
    expect(result.order.subtotal).toBe("1090000.00");
    expect(result.order.total).toBe("1090200.00");
    expect(result.order.items?.[0].product_name).toBe("Dell XPS 15");
    expect(result.order.items?.[0].unit_price).toBe("450000.00");
    expect(result.order.items?.[0].quantity).toBe(1);
    expect(result.order.items?.[0].line_total).toBe("450000.00");

    // The cart was converted to a permanent deduction — it is now empty.
    expect(getCartItemsSource()).toEqual([]);
  });

  it("serves the paginated order list under the orders key", async () => {
    session.start();
    const placed = await placeOrder(testAddresses[0].id);

    const result = await listOrders();

    expect(callCounts.orders).toBe(1);
    expect(result.orders.data.map((order) => order.id)).toContain(placed.order.id);
    expect(result.orders.per_page).toBe(15);
    expect(result.orders.current_page).toBe(1);
  });

  it("returns a single order with its items", async () => {
    session.start();
    const placed = await placeOrder(testAddresses[0].id);

    const result = await getOrder(placed.order.id);

    expect(callCounts.orderShow).toBe(1);
    expect(result.order.id).toBe(placed.order.id);
    expect(result.order.items).toHaveLength(2);
  });

  it("404s an unknown order with the server's exact body", async () => {
    session.start();

    await expect(getOrder(999999)).rejects.toMatchObject({
      response: { status: 404, data: { message: "Not Found" } },
    });
  });

  it("rejects an empty cart with the real 422 message", async () => {
    session.start();
    setCartItemsSource([]);

    await expect(placeOrder(testAddresses[0].id)).rejects.toMatchObject({
      response: {
        status: 422,
        data: { message: "Cannot place an order with an empty cart." },
      },
    });
  });

  it("rejects an expired hold with the real 422 message", async () => {
    session.start();
    // Replace the pool rather than mutate the shared fixture in place.
    setCartItemsSource([
      {
        ...getCartItemsSource()[0],
        hold_expires_at: "2020-01-01T00:00:00.000000Z",
        hold_status: "expired",
      },
    ]);

    await expect(placeOrder(testAddresses[0].id)).rejects.toMatchObject({
      response: {
        status: 422,
        data: {
          message: '"Dell XPS 15" is no longer reserved. Please re-add it to your cart.',
        },
      },
    });
  });

  it("404s an unknown address with the server's indistinguishable body", async () => {
    session.start();

    await expect(placeOrder(999999)).rejects.toMatchObject({
      response: { status: 404, data: { message: "Not Found" } },
    });
  });

  it("honours a forced place-order error exactly once", async () => {
    session.start();
    setPlaceOrderError({ status: 422, message: "Insufficient stock for \"Dell XPS 15\". Only 0 available." });

    await expect(placeOrder(testAddresses[0].id)).rejects.toMatchObject({
      response: { status: 422, data: { message: 'Insufficient stock for "Dell XPS 15". Only 0 available.' } },
    });

    // Single-use: the next attempt is served normally.
    const placed = await placeOrder(testAddresses[0].id);
    expect(placed.order.id).toBeGreaterThan(0);
  });
});

describe("request recorder", () => {
  it("records METHOD + path for every request the server saw", async () => {
    session.start();
    setOrdersSource([]);

    await getProducts();

    expect(recordedRequests).toContain("GET /api/v1/products");
  });

  it("records the place-order POST", async () => {
    session.start();

    await placeOrder(testAddresses[0].id);

    expect(recordedRequests).toContain("POST /api/v1/orders");
    expect(ORDERS_URL).toBe("http://localhost:8000/api/v1/orders");
    expect(ADDRESSES_URL).toBe("http://localhost:8000/api/v1/addresses");
  });
});
