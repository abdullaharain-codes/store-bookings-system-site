/**
 * ⚠️ THROWAWAY PHASE-4/5 VERIFICATION PAGE — DO NOT STYLE OR EXTEND.
 *
 * Proves Cart → Checkout → Order flow works end-to-end in a real browser.
 * Exercises: auth, cart CRUD, address creation, order placement, stock
 * deduction verification, order listing, and order cancellation.
 */
import { useCallback, useEffect, useState } from "react";
import {
  useAuthStore,
  getProducts,
  getCart,
  addCartItem,
  getAddresses,
  createAddress,
  placeOrder,
  listOrders,
  getOrder,
  cancelOrder,
  type Product,
  type Cart,
  type Address,
  type Order,
} from "@ecommerce/api-client";

interface LogEntry {
  ts: string;
  tag: string;
  msg: string;
  ok?: boolean;
}

function useLog() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const append = useCallback((tag: string, msg: string, ok?: boolean) => {
    const ts = new Date().toISOString().slice(11, 23);
    setLog((prev) => [...prev, { ts, tag, msg, ok }]);
  }, []);
  const clear = useCallback(() => setLog([]), []);
  return { log, append, clear };
}

export default function FlowVerifyPage() {
  const { user, isAuthenticated, login, isLoading: authLoading, error: authError } = useAuthStore();

  // ── Local state ──
  const [email, setEmail] = useState("customer@test.com");
  const [password, setPassword] = useState("password");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [stockBefore, setStockBefore] = useState<number | null>(null);
  const [stockAfter, setStockAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // Address form
  const [addrForm, setAddrForm] = useState({
    recipient_name: "Test Customer",
    phone: "03001234567",
    address_line_1: "123 Test Street",
    city: "Lahore",
    postal_code: "54000",
    label: "Home",
  });

  const { log, append, clear } = useLog();

  // ── Auth ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      append("AUTH", "Login successful", true);
    } catch {
      append("AUTH", "Login failed", false);
    }
  };

  // ── Load products ──
  const loadProducts = async () => {
    setLoading("products");
    try {
      const res = await getProducts({});
      setProducts(res.data);
      append("CATALOG", `Loaded ${res.data.length} products`, true);
    } catch (err: unknown) {
      append("CATALOG", `Failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Add to cart ──
  const handleAddToCart = async (product: Product) => {
    setLoading(`add-${product.id}`);
    try {
      // Snapshot stock BEFORE adding
      setStockBefore(product.stock_quantity);
      await addCartItem(product.id, 1);
      append("CART", `Added "${product.name}" (id=${product.id})`, true);
      // Refresh cart
      const cartRes = await getCart();
      setCart(cartRes.cart);
      append("CART", `Cart now has ${cartRes.cart.items.length} item(s)`, true);
    } catch (err: unknown) {
      append("CART", `Add failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Load cart ──
  const loadCart = async () => {
    setLoading("cart");
    try {
      const res = await getCart();
      setCart(res.cart);
      append("CART", `Cart: ${res.cart.items.length} item(s)`, true);
    } catch (err: unknown) {
      append("CART", `Load failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Create address ──
  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("address");
    try {
      await createAddress(addrForm);
      append("ADDR", "Address created", true);
      const res = await getAddresses();
      setAddresses(res.addresses);
      append("ADDR", `Has ${res.addresses.length} address(es)`, true);
    } catch (err: unknown) {
      append("ADDR", `Create failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Load addresses ──
  const loadAddresses = async () => {
    setLoading("addresses");
    try {
      const res = await getAddresses();
      setAddresses(res.addresses);
      append("ADDR", `Loaded ${res.addresses.length} address(es)`, true);
    } catch (err: unknown) {
      append("ADDR", `Load failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Place order ──
  const handlePlaceOrder = async () => {
    if (!addresses.length) {
      append("ORDER", "No address available — create one first", false);
      return;
    }
    setLoading("place-order");
    try {
      const addr = addresses[0];
      const res = await placeOrder(addr.id);
      const o = res.order;
      append("ORDER", `Order placed: ${o.order_number} | status=${o.status} | total=${o.total}`, true);
      append("ORDER", `  subtotal=${o.subtotal} shipping_fee=${o.shipping_fee}`, true);

      // Verify stock deduction via fresh product fetch
      if (cart && cart.items.length > 0) {
        const firstItem = cart.items[0];
        if (firstItem.product) {
          const freshProducts = await getProducts({});
          const freshProduct = freshProducts.data.find((p) => p.id === firstItem.product_id);
          if (freshProduct) {
            setStockAfter(freshProduct.stock_quantity);
            append("STOCK", `After order: "${freshProduct.name}" stock=${freshProduct.stock_quantity}`, true);
          }
        }
      }

      // Refresh cart — should be empty now
      const cartRes = await getCart();
      setCart(cartRes.cart);
      append("CART", `Cart after order: ${cartRes.cart.items.length} item(s) (expected 0)`, true);
    } catch (err: unknown) {
      append("ORDER", `Place failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── List orders ──
  const loadOrders = async () => {
    setLoading("orders");
    try {
      const res = await listOrders();
      setOrders(res.orders.data);
      append("ORDER", `Listed ${res.orders.data.length} order(s)`, true);
    } catch (err: unknown) {
      append("ORDER", `List failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── View order detail ──
  const handleViewOrder = async (orderId: number) => {
    setLoading(`order-${orderId}`);
    try {
      const res = await getOrder(orderId);
      setSelectedOrder(res.order);
      append("ORDER", `Detail: ${res.order.order_number} items=${res.order.items?.length ?? 0}`, true);
    } catch (err: unknown) {
      append("ORDER", `Detail failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Cancel order ──
  const handleCancelOrder = async (orderId: number) => {
    setLoading(`cancel-${orderId}`);
    try {
      const res = await cancelOrder(orderId);
      append("ORDER", `Cancelled: ${res.order.order_number} → status=${res.order.status}`, true);

      // Verify stock restoration
      if (selectedOrder?.items?.length) {
        const firstItem = selectedOrder.items[0];
        const freshProducts = await getProducts({});
        const freshProduct = freshProducts.data.find((p) => p.id === firstItem.product_id);
        if (freshProduct) {
          setStockAfter(freshProduct.stock_quantity);
          append("STOCK", `After cancel: "${freshProduct.name}" stock=${freshProduct.stock_quantity} (restored?)`, true);
        }
      }

      // Refresh order detail
      const detailRes = await getOrder(orderId);
      setSelectedOrder(detailRes.order);
    } catch (err: unknown) {
      append("ORDER", `Cancel failed: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setLoading(null);
    }
  };

  // ── Auto-load on auth ──
  useEffect(() => {
    if (isAuthenticated) {
      loadProducts();
      loadCart();
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──
  return (
    <div style={{ padding: 16, fontFamily: "monospace", fontSize: 13 }}>
      <h1>Phase-4/5 Cart → Checkout → Order Verification</h1>

      {/* ─── Login ─── */}
      {!isAuthenticated ? (
        <section data-testid="login-section">
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              data-testid="login-email"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="password"
              data-testid="login-password"
            />
            <button type="submit" disabled={authLoading} data-testid="login-submit">
              {authLoading ? "..." : "Login"}
            </button>
          </form>
          {authError && <p style={{ color: "red" }} data-testid="login-error">{authError}</p>}
        </section>
      ) : (
        <>
          <p data-testid="auth-status">
            Logged in as <strong>{user?.name}</strong> ({user?.email})
          </p>

          {/* ─── Products ─── */}
          <section data-testid="products-section">
            <h2>Products ({products.length})</h2>
            <button onClick={loadProducts} disabled={loading === "products"}>
              Reload Products
            </button>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>ID</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Name</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>SKU</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Price</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Stock</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{p.id}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{p.name}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{p.sku}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{p.price}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }} data-testid={`stock-${p.id}`}>
                      {p.stock_quantity}
                    </td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>
                      <button
                        onClick={() => handleAddToCart(p)}
                        disabled={loading === `add-${p.id}`}
                        data-testid={`add-to-cart-${p.id}`}
                      >
                        Add to Cart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <hr />

          {/* ─── Cart ─── */}
          <section data-testid="cart-section">
            <h2>Cart</h2>
            <button onClick={loadCart} disabled={loading === "cart"}>
              Refresh Cart
            </button>
            {cart && (
              <div>
                <p data-testid="cart-count">Cart ID: {cart.id} | Items: {cart.items.length}</p>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #ccc", padding: 4 }}>Item ID</th>
                      <th style={{ border: "1px solid #ccc", padding: 4 }}>Product</th>
                      <th style={{ border: "1px solid #ccc", padding: 4 }}>Qty</th>
                      <th style={{ border: "1px solid #ccc", padding: 4 }}>Hold Status</th>
                      <th style={{ border: "1px solid #ccc", padding: 4 }}>Hold Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.items.map((item) => (
                      <tr key={item.id} data-testid={`cart-item-${item.id}`}>
                        <td style={{ border: "1px solid #ccc", padding: 4 }}>{item.id}</td>
                        <td style={{ border: "1px solid #ccc", padding: 4 }}>
                          {item.product?.name ?? `product_id=${item.product_id}`}
                        </td>
                        <td style={{ border: "1px solid #ccc", padding: 4 }} data-testid={`cart-item-qty-${item.id}`}>
                          {item.quantity}
                        </td>
                        <td style={{ border: "1px solid #ccc", padding: 4 }} data-testid={`cart-item-hold-${item.id}`}>
                          {item.hold_status}
                        </td>
                        <td style={{ border: "1px solid #ccc", padding: 4 }}>
                          {item.hold_expires_at ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <hr />

          {/* ─── Addresses ─── */}
          <section data-testid="address-section">
            <h2>Addresses ({addresses.length})</h2>
            <button onClick={loadAddresses} disabled={loading === "addresses"}>
              Load Addresses
            </button>
            <form onSubmit={handleCreateAddress} style={{ margin: "8px 0" }}>
              <input
                value={addrForm.recipient_name}
                onChange={(e) => setAddrForm({ ...addrForm, recipient_name: e.target.value })}
                placeholder="recipient_name"
                data-testid="addr-name"
              />{" "}
              <input
                value={addrForm.phone}
                onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })}
                placeholder="phone"
                data-testid="addr-phone"
              />{" "}
              <input
                value={addrForm.address_line_1}
                onChange={(e) => setAddrForm({ ...addrForm, address_line_1: e.target.value })}
                placeholder="address_line_1"
                data-testid="addr-line1"
              />{" "}
              <input
                value={addrForm.city}
                onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                placeholder="city"
                data-testid="addr-city"
              />{" "}
              <button type="submit" disabled={loading === "address"} data-testid="create-address-btn">
                Create Address
              </button>
            </form>
            <ul>
              {addresses.map((a) => (
                <li key={a.id} data-testid={`address-${a.id}`}>
                  [{a.id}] {a.recipient_name}, {a.address_line_1}, {a.city}{" "}
                  {a.is_default ? "(default)" : ""}
                </li>
              ))}
            </ul>
          </section>

          <hr />

          {/* ─── Place Order ─── */}
          <section data-testid="order-section">
            <h2>Place Order</h2>
            <button
              onClick={handlePlaceOrder}
              disabled={loading === "place-order" || !addresses.length}
              data-testid="place-order-btn"
            >
              {loading === "place-order" ? "Placing..." : "Place Order"}
            </button>

            {stockBefore !== null && stockAfter !== null && (
              <p data-testid="stock-comparison">
                Stock before: {stockBefore} | after: {stockAfter} | delta: {stockBefore - stockAfter}
              </p>
            )}
          </section>

          <hr />

          {/* ─── Order History ─── */}
          <section data-testid="order-history-section">
            <h2>Orders ({orders.length})</h2>
            <button onClick={loadOrders} disabled={loading === "orders"} data-testid="load-orders-btn">
              Load Orders
            </button>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>ID</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Order #</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Status</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Total</th>
                  <th style={{ border: "1px solid #ccc", padding: 4 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} data-testid={`order-row-${o.id}`}>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{o.id}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{o.order_number}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }} data-testid={`order-status-${o.id}`}>
                      {o.status}
                    </td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>{o.total}</td>
                    <td style={{ border: "1px solid #ccc", padding: 4 }}>
                      <button
                        onClick={() => handleViewOrder(o.id)}
                        disabled={loading === `order-${o.id}`}
                        data-testid={`view-order-${o.id}`}
                      >
                        View
                      </button>{" "}
                      {o.status !== "cancelled" && o.status !== "delivered" && (
                        <button
                          onClick={() => handleCancelOrder(o.id)}
                          disabled={loading === `cancel-${o.id}`}
                          data-testid={`cancel-order-${o.id}`}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ─── Order Detail ─── */}
          {selectedOrder && (
            <section data-testid="order-detail-section">
              <h2>Order Detail: {selectedOrder.order_number}</h2>
              <pre data-testid="order-detail-json">
                {JSON.stringify(selectedOrder, null, 2)}
              </pre>
            </section>
          )}
        </>
      )}

      {/* ─── Verification Log ─── */}
      <section style={{ marginTop: 24 }}>
        <h2>
          Verification Log ({log.length})
          <button onClick={clear} style={{ marginLeft: 8, fontSize: 12 }}>
            Clear
          </button>
        </h2>
        <div
          data-testid="verification-log"
          style={{
            background: "#f5f5f5",
            padding: 8,
            maxHeight: 400,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {log.map((entry, i) => (
            <div
              key={i}
              style={{ color: entry.ok === false ? "red" : entry.ok === true ? "green" : undefined }}
              data-testid={`log-${entry.tag.toLowerCase()}`}
            >
              [{entry.ts}] {entry.tag}: {entry.msg}
            </div>
          ))}
          {log.length === 0 && <div>No entries yet.</div>}
        </div>
      </section>
    </div>
  );
}
