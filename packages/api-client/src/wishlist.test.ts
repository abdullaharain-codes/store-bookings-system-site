import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet, post: mockPost },
}));

import { getWishlist, toggleWishlist } from "./wishlist";
import type { WishlistItem } from "./wishlist";
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

const wishlistItem: WishlistItem = {
  id: 9,
  user_id: 5,
  product_id: 1,
  created_at: "2026-09-20T10:00:00.000000Z",
  updated_at: "2026-09-20T10:00:00.000000Z",
  product,
};

describe("wishlist", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("getWishlist calls /wishlist and returns the wrapped array", async () => {
    mockGet.mockResolvedValue({ data: { wishlist: [wishlistItem] } });

    const result = await getWishlist();

    expect(mockGet).toHaveBeenCalledWith("/wishlist");
    expect(result).toEqual({ wishlist: [wishlistItem] });
  });

  it("toggleWishlist posts to the interpolated URL and returns the wishlisted state", async () => {
    mockPost.mockResolvedValue({ data: { is_wishlisted: true } });

    const result = await toggleWishlist(42);

    expect(mockPost).toHaveBeenCalledWith("/wishlist/42");
    expect(result).toEqual({ is_wishlisted: true });
  });

  it("toggleWishlist reflects a removal with is_wishlisted false", async () => {
    mockPost.mockResolvedValue({ data: { is_wishlisted: false } });

    const result = await toggleWishlist(42);

    expect(result).toEqual({ is_wishlisted: false });
  });
});