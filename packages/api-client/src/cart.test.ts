import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete },
}));

import {
  addCartItem,
  buildAddCartItemRequest,
  getCart,
  removeCartItem,
  updateCartItem,
} from "./cart";
import type { Cart, CartItem } from "./cart";
import type { Product } from "./catalog";

const product: Product = {
  id: 1,
  name: "Laptop",
  slug: "laptop",
  sku: "LAP-001",
  description: "A laptop.",
price: "120000.00",
  compare_at_price: null,
  discount_percent: null,
  stock_quantity: 10,
  brand_id: null,
  is_published: true,
  is_featured: false,
  brand: null,
  categories: [],
  images: [],
};

const cartItem: CartItem = {
  id: 5,
  cart_id: 2,
  product_id: 1,
  quantity: 2,
  hold_expires_at: "2026-09-20T10:15:00.000000Z",
  hold_status: "active",
  product,
};

const cart: Cart = {
  id: 2,
  user_id: 4,
  items: [cartItem],
};

describe("cart", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
  });

  it("getCart calls /cart and returns the wrapped cart", async () => {
    mockGet.mockResolvedValue({ data: { cart } });

    const result = await getCart();

    expect(mockGet).toHaveBeenCalledWith("/cart");
    expect(result).toEqual({ cart });
  });

  it("addCartItem posts product_id and quantity to /cart/items", async () => {
    mockPost.mockResolvedValue({ data: { cart_item: cartItem } });

    const result = await addCartItem(1, 2);

    expect(mockPost).toHaveBeenCalledWith("/cart/items", {
      product_id: 1,
      quantity: 2,
    });
    expect(result).toEqual({ cart_item: cartItem });
  });

  it("buildAddCartItemRequest returns the exact POST request shape", () => {
    expect(buildAddCartItemRequest(11, 2)).toEqual({
      method: "POST",
      url: "/cart/items",
      data: { product_id: 11, quantity: 2 },
    });
  });

  it("addCartItem sends exactly buildAddCartItemRequest's url and body", async () => {
    mockPost.mockResolvedValue({ data: { cart_item: cartItem } });

    await addCartItem(1, 2);

    const request = buildAddCartItemRequest(1, 2);
    expect(mockPost).toHaveBeenCalledWith(request.url, request.data);
  });

  it("updateCartItem patches the interpolated URL with the new quantity", async () => {
    const data = { cart_item: cartItem, message: "Cart item updated." };
    mockPatch.mockResolvedValue({ data });

    const result = await updateCartItem(5, 3);

    expect(mockPatch).toHaveBeenCalledWith("/cart/items/5", { quantity: 3 });
    expect(result).toEqual(data);
  });

  it("removeCartItem deletes the interpolated URL and returns the message", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Cart item removed." } });

    const result = await removeCartItem(5);

    expect(mockDelete).toHaveBeenCalledWith("/cart/items/5");
    expect(result).toEqual({ message: "Cart item removed." });
  });
});