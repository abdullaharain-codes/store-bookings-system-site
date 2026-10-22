import { http, HttpResponse } from "msw";
import type {
  Asset,
  Brand,
  CartItem,
  Category,
  HomepageBanner,
  Product,
  ProductImage,
  ReviewShowcaseItem,
  Service,
  ShippingFeeResponse,
  User,
} from "@ecommerce/api-client";

/**
 * Origin split to match the real server (server/.env APP_URL +
 * VITE_API_URL). The API lives under /api/v1; the CSRF cookie endpoint is at
 * the server root, which is why the auth-store posts through a separate axios
 * instance built from the bare origin.
 */
export const SERVER_ORIGIN = "http://localhost:8000";
export const API_URL = `${SERVER_ORIGIN}/api/v1`;

/** Mirrors the shape AuthController returns: `{ user: User }`, no token. */
export interface AuthUserResponse {
  user: User;
}

export const testUser: User = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 2, name: "Customer", slug: "customer" },
};

export const CSRF_COOKIE_URL = `${SERVER_ORIGIN}/sanctum/csrf-cookie`;
export const LOGIN_URL = `${API_URL}/auth/login`;
export const REGISTER_URL = `${API_URL}/auth/register`;
export const USER_URL = `${API_URL}/auth/user`;
export const CART_ITEMS_URL = `${API_URL}/cart/items`;
export const CART_URL = `${API_URL}/cart`;
export const CATEGORIES_URL = `${API_URL}/categories`;
export const BRANDS_URL = `${API_URL}/brands`;
export const PRODUCTS_URL = `${API_URL}/products`;
export const REVIEW_SHOWCASE_URL = `${API_URL}/review-showcase`;
export const BANNERS_URL = `${API_URL}/homepage-banners`;
export const SERVICES_URL = `${API_URL}/services`;
export const SHIPPING_FEE_URL = `${API_URL}/shipping-fee`;

/**
 * Public read endpoints behind the site header. The categories fixture is
 * deliberately a FLAT list keyed by `parent_category_id` — that is the real
 * CategoryController shape, and the header has to rebuild the tree itself.
 */
export const testCategories: Category[] = [
  {
    id: 1,
    name: "Laptops",
    slug: "laptops",
    description: null,
    display_order: 1,
    is_published: true,
    parent_category_id: null,
    logo_asset: null,
    banner_asset: null,
  },
  {
    id: 2,
    name: "Gaming Laptops",
    slug: "gaming-laptops",
    description: null,
    display_order: 1,
    is_published: true,
    parent_category_id: 1,
    logo_asset: null,
    banner_asset: null,
  },
  {
    id: 3,
    name: "Business Laptops",
    slug: "business-laptops",
    description: null,
    display_order: 2,
    is_published: true,
    parent_category_id: 1,
    logo_asset: null,
    banner_asset: null,
  },
  {
    id: 4,
    name: "Accessories",
    slug: "accessories",
    description: null,
    display_order: 2,
    is_published: true,
    parent_category_id: null,
    logo_asset: null,
    banner_asset: null,
  },
];

export const testBrands: Brand[] = [
  {
    id: 1,
    name: "Dell",
    slug: "dell",
    description: null,
    logo_asset_id: null,
    banner_asset_id: null,
    is_published: true,
    logo_asset: null,
  },
  {
    id: 2,
    name: "HP",
    slug: "hp",
    description: null,
    logo_asset_id: null,
    banner_asset_id: null,
    is_published: true,
    logo_asset: null,
  },
];

/**
 * Home page product fixture. Deliberately spans two categories and two brands
 * with descending prices, so a test can tell the difference between a filtered,
 * sorted, and paginated response rather than getting one list every time.
 *
 * `is_featured` (BE2) is spread across the rows rather than set on all of them:
 * the Featured carousel and the New Arrivals grid request the SAME endpoint with
 * different params, so a test can only prove the filter was honoured if the two
 * responses differ. 11 and 13 are featured, 12 and 14 are not, and 15 is
 * featured-but-unpublished — mirroring the real controller, where publication
 * and merchandising are independent.
 */
export const testProducts: Product[] = [
  {
    id: 11,
    name: "Dell XPS 15",
    slug: "dell-xps-15",
    sku: "DX15-11",
    description: "Creator laptop.",
    price: "450000.00",
    // DISCOUNT-1: this product carries a discount so Home renders the
    // strikethrough + "-13%" badge path. The others are intentionally plain.
    compare_at_price: "520000.00",
    discount_percent: 13,
    stock_quantity: 4,
    brand_id: 1,
    is_published: true,
    is_featured: true,
    brand: testBrands[0],
    categories: [testCategories[1]],
    images: [],
  },
  {
    id: 12,
    name: "HP Spectre x360",
    slug: "hp-spectre-x360",
    sku: "SPX360-12",
    description: "Convertible laptop.",
    price: "320000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 7,
    brand_id: 2,
    is_published: true,
    is_featured: false,
    brand: testBrands[1],
    categories: [testCategories[0]],
    images: [],
  },
  {
    id: 13,
    name: "Dell Latitude 5440",
    slug: "dell-latitude-5440",
    sku: "DL5440-13",
    description: "Business laptop.",
    price: "210000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 0,
    brand_id: 1,
    is_published: true,
    is_featured: true,
    brand: testBrands[0],
    categories: [testCategories[2]],
    images: [],
  },
  {
    id: 14,
    name: "HP EliteBook 840",
    slug: "hp-elitebook-840",
    sku: "EB840-14",
    description: null,
    price: "275000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 2,
    brand_id: 2,
    is_published: true,
    is_featured: false,
    brand: testBrands[1],
    categories: [testCategories[2]],
    images: [],
  },
  {
    id: 15,
    name: "Unpublished Prototype",
    slug: "unpublished-prototype",
    sku: "PROTO-15",
    description: null,
    price: "999999.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 1,
    brand_id: 1,
    is_published: false,
    is_featured: true,
    brand: testBrands[0],
    categories: [testCategories[0]],
    images: [],
  },
];

/**
 * The pool the products handler pages and filters over. Defaults to the
 * fixture above, but a test that needs to drive pagination (a total beyond one
 * page) or an "everything filtered out" empty state swaps it via
 * `setProductsSource`. Kept out of the shared catalog fixture so existing
 * tests keep the exact records they assert against.
 */
let productsSource: Product[] = [...testProducts];

export function setProductsSource(products: Product[]): void {
  productsSource = products;
}

// ─── Product detail fixtures (TASK B3-2) ─────────────────────────────────────

function detailAsset(id: number, name: string, altText: string | null = null): Asset {
  return {
    id,
    uuid: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    disk: "public",
    path: `products/${name}.jpg`,
    thumbnail_path: null,
    url: `${SERVER_ORIGIN}/storage/uploads/products/${name}.jpg`,
    thumbnail_url: null,
    original_name: `${name}.jpg`,
    mime_type: "image/jpeg",
    size: 204800,
    width: 1200,
    height: 900,
    alt_text: altText,
  };
}

function detailImage(
  id: number,
  productId: number,
  displayOrder: number,
  name: string,
  altText: string | null = null,
): ProductImage {
  return {
    id,
    product_id: productId,
    asset_id: id,
    display_order: displayOrder,
    asset: detailAsset(id, name, altText),
  };
}

/**
 * Product-detail fixtures (GET /products/:slug). Deliberately diverse so one
 * handler drives every detail-page branch:
 * - `dell-xps-15`: 3 images, a discount, a 2-level category and an
 *   HTML-looking description.
 * - `dell-latitude-5440`: out of stock, a single image.
 * - `hp-spectre-x360`: a single image and NO category (breadcrumb fallback).
 * - `hp-elitebook-840`: no images (placeholder).
 */
export const testProductDetails: Product[] = [
  {
    id: 11,
    name: "Dell XPS 15",
    slug: "dell-xps-15",
    sku: "DX15-11",
    description: "<b>Creator</b> laptop.",
    price: "450000.00",
    compare_at_price: "520000.00",
    discount_percent: 13,
    stock_quantity: 4,
    brand_id: 1,
    is_published: true,
    is_featured: true,
    brand: testBrands[0],
    categories: [testCategories[1]],
    images: [
      detailImage(301, 11, 0, "dell-xps-15-1"),
      detailImage(302, 11, 1, "dell-xps-15-2"),
      detailImage(303, 11, 2, "dell-xps-15-3"),
    ],
  },
  {
    id: 13,
    name: "Dell Latitude 5440",
    slug: "dell-latitude-5440",
    sku: "DL5440-13",
    description: "Business laptop.",
    price: "210000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 0,
    brand_id: 1,
    is_published: true,
    is_featured: true,
    brand: testBrands[0],
    categories: [testCategories[2]],
    images: [detailImage(311, 13, 0, "dell-latitude-5440")],
  },
  {
    id: 12,
    name: "HP Spectre x360",
    slug: "hp-spectre-x360",
    sku: "SPX360-12",
    description: "Convertible laptop.",
    price: "320000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 7,
    brand_id: 2,
    is_published: true,
    is_featured: false,
    brand: testBrands[1],
    categories: [],
    images: [detailImage(321, 12, 0, "hp-spectre-x360")],
  },
  {
    id: 14,
    name: "HP EliteBook 840",
    slug: "hp-elitebook-840",
    sku: "EB840-14",
    description: null,
    price: "275000.00",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 2,
    brand_id: 2,
    is_published: true,
    is_featured: false,
    brand: testBrands[1],
    categories: [testCategories[2]],
    images: [],
  },
];

let productDetailSource: Product[] = [...testProductDetails];

export function setProductDetailSource(products: Product[]): void {
  productDetailSource = products;
}

/**
 * The product pool the cart/order handlers snapshot from. Placing an order
 * copies name/sku/price off this same pool, so an order's line items match the
 * product the cart was showing (OrderService snapshots the product row).
 */
export function getProductDetailPool(): Product[] {
  return productDetailSource;
}

/** Slugs the detail endpoint was asked for, in call order. */
export const productDetailRequests: { slug: string }[] = [];

// ─── Service fixtures (TASK B3-3) ────────────────────────────────────────────

/**
 * Published service fixtures for the /services listing and /service/:slug
 * detail page. Four services so the listing renders a real grid; `pc-build`
 * carries a NULL description so a test can prove the description element is
 * omitted rather than rendered empty. The Service type has no image/asset
 * field, so there is no media branch to model.
 */
export const testServices: Service[] = [
  {
    id: 1,
    name: "Laptop Screen Repair",
    slug: "laptop-screen-repair",
    description: "<b>Full</b> screen replacement with a 6-month warranty.",
    price_min: "2500",
    price_max: "8000",
    duration_minutes: 90,
    is_published: true,
  },
  {
    id: 2,
    name: "Network Setup",
    slug: "network-setup",
    description: "Router, switch and Wi-Fi configuration for a small office.",
    price_min: "5000",
    price_max: "15000",
    duration_minutes: 120,
    is_published: true,
  },
  {
    id: 3,
    name: "PC Build",
    slug: "pc-build",
    description: null,
    price_min: "10000",
    price_max: "50000",
    duration_minutes: 180,
    is_published: true,
  },
  {
    id: 4,
    name: "Data Recovery",
    slug: "data-recovery",
    description: "Recover files from a failing drive or accidental deletion.",
    price_min: "3000",
    price_max: "20000",
    duration_minutes: 60,
    is_published: true,
  },
];

/**
 * The pool the /services list handler pages over. Defaults to EMPTY so the
 * Home "Popular Services" row stays out of unrelated tests (it already treats a
 * payload-less response as "omit the section"); a listing test swaps it via
 * `setServicesListSource`.
 */
let servicesListSource: Service[] = [];

export function setServicesListSource(services: Service[]): void {
  servicesListSource = services;
}

/** Query params of each /services list call, in order. */
export const servicesListRequests: { params: URLSearchParams }[] = [];

/** Slugs the service detail endpoint was asked for, in call order. */
export const serviceDetailRequests: { slug: string }[] = [];

/**
 * The public flat shipping fee (BE5, D2). A single money string mirroring
 * ShippingFeeController's `{ shipping_fee }` payload — the same value
 * OrderService stores as `order.shipping_fee`. Defaults to the seeded 200.00;
 * a test swaps it via `setShippingFeeSource` to prove the client reads the
 * live value rather than a baked-in constant.
 */
export const testShippingFee = "200.00";

let shippingFeeSource = testShippingFee;

export function setShippingFeeSource(fee: string): void {
  shippingFeeSource = fee;
}

/**
 * The live flat fee. Order placement in handlers-checkout.ts reads this same
 * source, so an order's shipping_fee always equals what GET /shipping-fee
 * served — the invariant OrderService guarantees by reading one service.
 */
export function getShippingFeeSource(): string {
  return shippingFeeSource;
}

/**
 * Hero banner fixture (TASK B2c). Two banners on purpose:
 * - id 1 carries overlay copy, which is what PRD §8 / BE1 call the authored case.
 * - id 2 is IMAGE ONLY (`headline`/`subtitle` both null) — the documented common
 *   case — so a test can prove the overlay is omitted rather than rendered empty.
 *
 * Not used by the default handler (which returns no banners, so the hero stays
 * out of unrelated pages); a hero test overrides BANNERS_URL with server.use().
 */
export const testBanners: HomepageBanner[] = [
  {
    id: 1,
    asset_id: 21,
    target_category_id: 1,
    display_order: 0,
    is_published: true,
    start_at: null,
    end_at: null,
    headline: "Summer laptop sale",
    subtitle: "Up to 40% off selected models.",
    asset: {
      id: 21,
      uuid: "9f1c2a3b-4d5e-4f6a-8b7c-1d2e3f4a5b6c",
      disk: "public",
      path: "homepage/hero-laptops.png",
      thumbnail_path: null,
      url: `${SERVER_ORIGIN}/storage/uploads/homepage/hero-laptops.png`,
      thumbnail_url: null,
      original_name: "hero-laptops.png",
      mime_type: "image/png",
      size: 254871,
      width: 2400,
      height: 1200,
      alt_text: null,
    },
    target_category: {
      id: 1,
      name: "Laptops",
      slug: "laptops",
      description: null,
      display_order: 1,
      is_published: true,
      parent_category_id: null,
      logo_asset: null,
      banner_asset: null,
    },
  },
  {
    id: 2,
    asset_id: 22,
    target_category_id: 4,
    display_order: 1,
    is_published: true,
    start_at: null,
    end_at: null,
    headline: null,
    subtitle: null,
    asset: {
      id: 22,
      uuid: "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d",
      disk: "public",
      path: "homepage/hero-accessories.png",
      thumbnail_path: null,
      url: `${SERVER_ORIGIN}/storage/uploads/homepage/hero-accessories.png`,
      thumbnail_url: null,
      original_name: "hero-accessories.png",
      mime_type: "image/png",
      size: 198322,
      width: 2400,
      height: 1200,
      alt_text: null,
    },
    target_category: {
      id: 4,
      name: "Accessories",
      slug: "accessories",
      description: null,
      display_order: 2,
      is_published: true,
      parent_category_id: null,
      logo_asset: null,
      banner_asset: null,
    },
  },
];

/** One published screenshot, mirroring ReviewShowcaseItem's serialized shape. */
export const testReviewShowcaseItem: ReviewShowcaseItem = {
  id: 1,
  asset_id: 5,
  caption: "My new setup",
  display_order: 0,
  is_published: true,
  created_at: "2026-08-25T10:00:00.000000Z",
  updated_at: "2026-08-25T10:00:00.000000Z",
  asset: {
    id: 5,
    uuid: "5a6f1c2e-8b3d-4a91-9f77-2c1d0e4b8a33",
    disk: "public",
    path: "reviews/setup.jpg",
    thumbnail_path: null,
    url: `${SERVER_ORIGIN}/storage/uploads/reviews/setup.jpg`,
    thumbnail_url: null,
    original_name: "setup.jpg",
    mime_type: "image/jpeg",
    size: 204800,
    width: 1200,
    height: 800,
    alt_text: "Desk with a laptop",
  },
};

/**
 * A PARENT `category_id` matches products in any of its descendants, because
 * ProductController filters through the Taxonomy scope. The fixture is a flat
 * list keyed by `parent_category_id`, so the walk is done here rather than in
 * the fixture. A child id resolves to just itself.
 */
function categoryWithDescendants(id: number): number[] {
  const ids = [id];
  // The taxonomy is 2 levels deep in the fixture, but walk until it stops
  // growing so adding a deeper level cannot silently break the filter.
  for (let index = 0; index < ids.length; index += 1) {
    for (const category of testCategories) {
      if (category.parent_category_id === ids[index] && !ids.includes(category.id)) {
        ids.push(category.id);
      }
    }
  }
  return ids;
}

const testCartItem = (id: number, productId: number, quantity: number): CartItem => ({
  id,
  cart_id: 1,
  product_id: productId,
  quantity,
  hold_expires_at: null,
  hold_status: "none",
});

/**
 * The header badge derives its count from GET /cart, so the add handler must
 * write through to the same source a B4-1a flow test can read. Defaults to the
 * two line items the badge tests expect; a flow test swaps in its own pool.
 */
export const testCartItems: CartItem[] = [
  testCartItem(1, 11, 1),
  testCartItem(2, 12, 2),
];

let cartItemsSource: CartItem[] = [...testCartItems];

export function setCartItemsSource(items: CartItem[]): void {
  cartItemsSource = items;
}

/**
 * The current in-memory cart pool. The checkout handlers live in a separate
 * module (handlers-checkout.ts) and read/empty this same source so placing an
 * order clears exactly the cart a preceding GET /cart returned. The backing
 * `let` stays private to avoid a second writer bypassing the setter.
 */
export function getCartItemsSource(): CartItem[] {
  return cartItemsSource;
}

export function clearCartItemsSource(): void {
  cartItemsSource = [];
}

/** Bodies of every PATCH /cart/items/:id, in call order (wire evidence). */
export const cartPatchBodies: { id: number; quantity: number }[] = [];

/** Upsert a product into the in-memory cart, mirroring CartService.addItem. */
export function addToCartSource(productId: number, quantity: number): void {
  const existing = cartItemsSource.find((item) => item.product_id === productId);
  if (existing) {
    cartItemsSource = cartItemsSource.map((item) =>
      item.product_id === productId
        ? { ...item, quantity: item.quantity + quantity }
        : item
    );
    return;
  }
  const nextId = Math.max(0, ...cartItemsSource.map((item) => item.id)) + 1;
  cartItemsSource = [...cartItemsSource, testCartItem(nextId, productId, quantity)];
}

/**
 * In-memory session. Sanctum is cookie-based, but a test cannot replay a real
 * cross-origin cookie through jsdom + MSW reliably, so the flag below stands
 * in for "the browser holds a valid session cookie" and is the single source
 * of truth every auth handler reads.
 */
let sessionActive = false;

export const session = {
  get active() {
    return sessionActive;
  },
  start() {
    sessionActive = true;
  },
  end() {
    sessionActive = false;
  },
};

/** Call counters, so a test can assert a replayed request happened once. */
export const callCounts = {
  login: 0,
  register: 0,
  user: 0,
  cartItems: 0,
  cart: 0,
  cartUpdate: 0,
  cartDelete: 0,
  categories: 0,
  brands: 0,
  products: 0,
  banners: 0,
  reviewShowcase: 0,
  shippingFee: 0,
  addresses: 0,
  addressCreate: 0,
  orders: 0,
  orderShow: 0,
  orderPlace: 0,
  wishlist: 0,
  wishlistToggle: 0,
  reset() {
    this.login = 0;
    this.register = 0;
    this.user = 0;
    this.cartItems = 0;
    this.cart = 0;
    this.cartUpdate = 0;
    this.cartDelete = 0;
    this.categories = 0;
    this.brands = 0;
    this.products = 0;
    this.banners = 0;
    this.reviewShowcase = 0;
    this.shippingFee = 0;
    this.addresses = 0;
    this.addressCreate = 0;
    this.orders = 0;
    this.orderShow = 0;
    this.orderPlace = 0;
    this.wishlist = 0;
    this.wishlistToggle = 0;
  },
};

/**
 * A forced failure for the NEXT PATCH /cart/items/:id, so a test can drive the
 * cart page's inline-error branch (a 422 stock rejection carries a top-level
 * `message` and no `errors` bag — see CartController::updateItem). `null` means
 * the handler behaves normally. Cleared after every test in setup.ts.
 */
let cartUpdateError: { status: number; message: string } | null = null;

export function setCartUpdateError(
  error: { status: number; message: string } | null,
): void {
  cartUpdateError = error;
}

/**
 * Number of times the products endpoint was called and the query params of the
 * most recent call. Tests assert on these instead of spying on the client so
 * they prove what actually went over the wire.
 */
export const productRequests: { params: URLSearchParams }[] = [];

export const reviewShowcaseRequests: { params: URLSearchParams }[] = [];

const unauthenticated = () =>
  HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });

/** Laravel's standard validation failure body (server bootstrap/app.php). */
const validationFailed = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { message: "The given data was invalid.", errors },
    { status: 422 }
  );

export const handlers = [
  /**
   * CSRF preflight only. It deliberately does NOT start the in-memory
   * session: handing out a XSRF-TOKEN cookie is not a login, and Sanctum's
   * `GET /auth/user` would still 401 for a guest that merely preflighted.
   */
  http.get(CSRF_COOKIE_URL, () => new HttpResponse(null, { status: 204 })),

  http.post(LOGIN_URL, async ({ request }) => {
    callCounts.login += 1;
    const body = (await request.json()) as { email?: string };

    // Wrong password, per AuthController::login returning 401.
    if (body.email !== testUser.email) {
      return HttpResponse.json(
        { message: "Invalid credentials." },
        { status: 401 }
      );
    }

    session.start();
    return HttpResponse.json<AuthUserResponse>({ user: testUser });
  }),

  http.post(REGISTER_URL, async ({ request }) => {
    callCounts.register += 1;
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      password_confirmation?: string;
    };

    if (body.email === "taken@example.test") {
      return validationFailed({
        email: ["The email has already been taken."],
      });
    }
    // RegisterRequest: password => ['required','string','min:8','confirmed']
    if (
      (body.password ?? "").length < 8 ||
      body.password !== body.password_confirmation
    ) {
      return validationFailed({
        password: ["The password confirmation does not match."],
      });
    }

    session.start();
    return HttpResponse.json<AuthUserResponse>({ user: testUser }, { status: 201 });
  }),

  http.get(USER_URL, () => {
    callCounts.user += 1;
    if (!session.active) return unauthenticated();
    return HttpResponse.json<AuthUserResponse>({ user: testUser });
  }),

  http.post(CART_ITEMS_URL, async ({ request }) => {
    callCounts.cartItems += 1;
    if (!session.active) return unauthenticated();

    const body = (await request.json()) as {
      product_id?: number;
      quantity?: number;
    };
    if (!body.product_id || !body.quantity) {
      return validationFailed({
        product_id: ["The product id field is required."],
        quantity: ["The quantity field is required."],
      });
    }

    addToCartSource(body.product_id as number, body.quantity as number);

    return HttpResponse.json(
      { cart_item: { id: 1, product_id: body.product_id, quantity: body.quantity } },
      { status: 201 }
    );
  }),

  /**
   * Public taxonomy. `parent_id` is honoured so the fixture also proves the
   * header can rely on a single unfiltered call and group the flat rows itself.
   */
  http.get(CATEGORIES_URL, ({ request }) => {
    callCounts.categories += 1;
    const parentId = new URL(request.url).searchParams.get("parent_id");
    if (parentId === null) {
      return HttpResponse.json({ categories: testCategories });
    }
    const id = Number(parentId);
    return HttpResponse.json({
      categories: testCategories.filter(
        (category) => category.parent_category_id === id
      ),
    });
  }),

  /**
   * Category by slug (ProductListing and detail page resolution). Mirrors
   * CategoryController::show: missing OR unpublished categories 404 as
   * `{ message }`, so the "not found" state is an error, not an empty object.
   */
  http.get(`${API_URL}/categories/:slug`, ({ params }) => {
    const slug = params.slug as string;
    const category = testCategories.find((item) => item.slug === slug);
    if (!category || !category.is_published) {
      return HttpResponse.json({ message: "Not Found." }, { status: 404 });
    }
    return HttpResponse.json({ category });
  }),

  http.get(BRANDS_URL, () => {
    callCounts.brands += 1;
    return HttpResponse.json({ brands: testBrands });
  }),

  /**
   * Brand by slug (ProductListing resolution). Same 404 contract as the
   * category-by-slug handler above.
   */
  http.get(`${API_URL}/brands/:slug`, ({ params }) => {
    const slug = params.slug as string;
    const brand = testBrands.find((item) => item.slug === slug);
    if (!brand || !brand.is_published) {
      return HttpResponse.json({ message: "Not Found." }, { status: 404 });
    }
    return HttpResponse.json({ brand });
  }),

  /**
   * Hero banners and popular services feed the Home route's other sections.
   * Both default to EMPTY on purpose: design.md §3.9 omits a section whose
   * collection has no published items, so an empty list keeps the hero and the
   * services block out of the document and lets a taxonomy-band test assert
   * against a page that contains only the bands under test. A test that needs
   * real banners/services overrides the handler with server.use().
   */
  http.get(BANNERS_URL, () => {
    callCounts.banners += 1;
    return HttpResponse.json({ banners: [] });
  }),

  /**
   * Public flat shipping fee (ShippingFeeController::show, BE5/D2). No auth,
   * exactly one field, read live from the swappable source so a test can prove
   * the client renders the current value.
   */
  http.get(SHIPPING_FEE_URL, () => {
    callCounts.shippingFee += 1;
    return HttpResponse.json<ShippingFeeResponse>({
      shipping_fee: shippingFeeSource,
    });
  }),

  /**
   * Public service listing. Mirrors ServiceController::index: published-only,
   * paginated, honouring `page` and `per_page` (clamped 1..48 through the same
   * bound as /products). Defaults to an empty pool so Home's Popular Services
   * row stays out of unrelated tests; setServicesListSource swaps it in.
   */
  http.get(SERVICES_URL, ({ request }) => {
    const params = new URL(request.url).searchParams;
    servicesListRequests.push({ params });

    const items = servicesListSource.filter((service) => service.is_published);
    const rawPerPage = Number(params.get("per_page") ?? 15);
    const perPage = Math.min(48, Math.max(1, Math.round(rawPerPage) || 15));
    const total = items.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const from = (currentPage - 1) * perPage;
    const data = items.slice(from, from + perPage);

    return HttpResponse.json({
      data,
      links: [],
      current_page: currentPage,
      first_page_url: null,
      from: data.length ? from + 1 : null,
      last_page: lastPage,
      last_page_url: null,
      next_page_url: null,
      path: SERVICES_URL,
      per_page: perPage,
      prev_page_url: null,
      to: data.length ? from + data.length : null,
      total,
    });
  }),

  /**
   * Published service detail by slug (ServiceController::show). Missing OR
   * unpublished slugs 404 as `{ message: "Not Found." }` — the same contract as
   * the product detail route.
   */
  http.get(`${SERVICES_URL}/:slug`, ({ params }) => {
    const slug = params.slug as string;
    serviceDetailRequests.push({ slug });
    const service = testServices.find(
      (item) => item.slug === slug && item.is_published,
    );
    if (!service) {
      return HttpResponse.json({ message: "Not Found." }, { status: 404 });
    }
    return HttpResponse.json({ service });
  }),

  /**
   * Public product listing, paginated exactly like ProductController. Honours
   * `per_page`, `category_id`, `page`, `sort`, `featured`, and the BE4 filters
   * `min_price`/`max_price`/`in_stock`, so a Home or Shop test can prove the
   * client sent what it meant to.
   *
   * `featured` (BE2) is symmetric: `1`/`true` narrows to featured only, `0`/`false`
   * to non-featured only, and absent/empty means no filtering at all. A handler
   * that treated a missing value as `false` would hide the bug where the client
   * drops the param instead of sending `0`. `in_stock` (BE4) follows the same
   * 1/0-on-the-wire contract.
   *
   * `per_page` is clamped to 1..48 to mirror the CLIENT's contract
   * (catalog.ts PER_PAGE_MAX), which is also the real server's cap — BE4
   * deployed `App\Support\PerPage::MAX` with the same bound. A handler that
   * refused out-of-range values would test a server that does not behave that
   * way.
   *
   * A parent `category_id` matches the category and its descendants, matching
   * ProductController's Taxonomy scope — see categoryWithDescendants.
   */
  http.get(PRODUCTS_URL, ({ request }) => {
    callCounts.products += 1;
    const params = new URL(request.url).searchParams;
    productRequests.push({ params });

    // The real controller publishes only.
    let items = productsSource.filter((product) => product.is_published);

    const featured = params.get("featured");
    if (featured !== null && featured !== "") {
      const wantFeatured = featured === "1" || featured === "true";
      items = items.filter((product) => product.is_featured === wantFeatured);
    }

    const categoryId = params.get("category_id");
    if (categoryId !== null) {
      const scope = categoryWithDescendants(Number(categoryId));
      items = items.filter((product) =>
        product.categories.some((category) => scope.includes(category.id)),
      );
    }

    const brandId = params.get("brand_id");
    if (brandId !== null) {
      const id = Number(brandId);
      items = items.filter((product) => product.brand_id === id);
    }

    const search = params.get("search");
    if (search) {
      const needle = search.toLowerCase();
      items = items.filter((product) =>
        product.name.toLowerCase().includes(needle),
      );
    }

    // BE4 price bounds; a bound the admin never crosses narrows to nothing,
    // which is the same "no results" a server filter produces.
    const minPrice = params.get("min_price");
    if (minPrice !== null && minPrice !== "") {
      const bound = Number(minPrice);
      if (Number.isFinite(bound)) {
        items = items.filter((product) => Number(product.price) >= bound);
      }
    }
    const maxPrice = params.get("max_price");
    if (maxPrice !== null && maxPrice !== "") {
      const bound = Number(maxPrice);
      if (Number.isFinite(bound)) {
        items = items.filter((product) => Number(product.price) <= bound);
      }
    }

    const inStock = params.get("in_stock");
    if (inStock === "1" || inStock === "true") {
      items = items.filter((product) => product.stock_quantity > 0);
    } else if (inStock === "0" || inStock === "false") {
      items = items.filter((product) => product.stock_quantity === 0);
    }

    const sort = params.get("sort");
    if (sort === "price_asc") {
      items = [...items].sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sort === "price_desc") {
      items = [...items].sort((a, b) => Number(b.price) - Number(a.price));
    }
    // `sort=newest` needs no branch: the repository's default ordering is
    // already created_at DESC, and the fixture is authored newest-first, so the
    // list is returned as-is.

    const rawPerPage = Number(params.get("per_page") ?? 15);
    const perPage = Math.min(48, Math.max(1, Math.round(rawPerPage) || 15));
    const total = items.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const from = (currentPage - 1) * perPage;
    const data = items.slice(from, from + perPage);

    return HttpResponse.json({
      data,
      links: [],
      current_page: currentPage,
      first_page_url: null,
      from: data.length ? from + 1 : null,
      last_page: lastPage,
      last_page_url: null,
      next_page_url: null,
      path: PRODUCTS_URL,
      per_page: perPage,
      prev_page_url: null,
      to: data.length ? from + data.length : null,
      total,
    });
  }),

  /**
   * Published product detail by slug (ProductController::show). Mirrors the
   * real contract: missing OR unpublished slugs 404 as `{ message: "Not Found." }`,
   * so the detail page's not-found state is an error, not an empty object.
   */
  http.get(`${PRODUCTS_URL}/:slug`, ({ params }) => {
    const slug = params.slug as string;
    productDetailRequests.push({ slug });
    const product = productDetailSource.find(
      (item) => item.slug === slug && item.is_published,
    );
    if (!product) {
      return HttpResponse.json({ message: "Not Found." }, { status: 404 });
    }
    return HttpResponse.json({ product });
  }),

  /**
   * Public review-showcase gallery. Returns the `{ review_showcase_items }`
   * envelope the controller wraps, in `display_order` order, and honours
   * `page` when the client sends one.
   */
  http.get(REVIEW_SHOWCASE_URL, ({ request }) => {
    callCounts.reviewShowcase += 1;
    const params = new URL(request.url).searchParams;
    reviewShowcaseRequests.push({ params });

    const items = [testReviewShowcaseItem];
    const rawPerPage = Number(params.get("per_page") ?? 15);
    const perPage = Math.min(48, Math.max(1, Math.round(rawPerPage) || 15));
    const currentPage = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const from = (currentPage - 1) * perPage;
    const data = items.slice(from, from + perPage);

    return HttpResponse.json({
      review_showcase_items: {
        data,
        links: [],
        current_page: currentPage,
        first_page_url: null,
        from: data.length ? from + 1 : null,
        last_page: Math.max(1, Math.ceil(items.length / perPage)),
        last_page_url: null,
        next_page_url: null,
        path: REVIEW_SHOWCASE_URL,
        per_page: perPage,
        prev_page_url: null,
        to: data.length ? from + data.length : null,
        total: items.length,
      },
    });
  }),

  /**
   * Cart items are per-user, so PATCH mirrors CartController::updateItem:
   * session-gated, 404 for a missing/wrong-owner line, 422 for a negative
   * quantity, and `0` removes the line while still returning 200 with a stub.
   * The shared `cartItemsSource` is mutated in place so a following GET /cart
   * reflects the change (which is what makes the invalidation observable).
   *
   * A test can force the next call to fail via `setCartUpdateError`, standing
   * in for the real stock rejection whose message is NOT in an `errors` bag.
   */
  http.patch(`${CART_ITEMS_URL}/:id`, async ({ request, params }) => {
    callCounts.cartUpdate += 1;
    if (!session.active) return unauthenticated();

    if (cartUpdateError) {
      const { status, message } = cartUpdateError;
      return HttpResponse.json({ message }, { status });
    }

    const id = Number(params.id);
    const body = (await request.json()) as { quantity?: number };
    const quantity = body.quantity;
    // Recorded AFTER parsing but BEFORE the forced-error branch, so a test can
    // still read the exact body of a request that was rejected.
    cartPatchBodies.push({ id, quantity: quantity as number });

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return validationFailed({
        quantity: ["The quantity field must be an integer of at least 0."],
      });
    }

    const existing = cartItemsSource.find((item) => item.id === id);
    if (!existing) {
      return HttpResponse.json({ message: "Not Found." }, { status: 404 });
    }

    if (quantity === 0) {
      cartItemsSource = cartItemsSource.filter((item) => item.id !== id);
      return HttpResponse.json({
        cart_item: { ...existing, quantity: 0 },
        message: "Cart item updated.",
      });
    }

    // CartService::updateQuantity renews the hold even when the quantity is
    // unchanged (no early return), so a PATCH is what "Reserve again" uses to
    // flip an expired line back to active: hold_expires_at -> now + 30 min.
    const renewedHoldExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    cartItemsSource = cartItemsSource.map((item) =>
      item.id === id
        ? {
            ...item,
            quantity,
            hold_expires_at: renewedHoldExpiresAt,
            hold_status: "active" as const,
          }
        : item,
    );
    const updated = cartItemsSource.find((item) => item.id === id)!;
    return HttpResponse.json({
      cart_item: updated,
      message: "Cart item updated.",
    });
  }),

  /** Remove a cart line (CartController::destroy). 404 for a missing line. */
  http.delete(`${CART_ITEMS_URL}/:id`, ({ params }) => {
    callCounts.cartDelete += 1;
    if (!session.active) return unauthenticated();

    const id = Number(params.id);
    const existing = cartItemsSource.find((item) => item.id === id);
    if (!existing) {
      return HttpResponse.json({ message: "Not Found." }, { status: 404 });
    }

    cartItemsSource = cartItemsSource.filter((item) => item.id !== id);
    return HttpResponse.json({ message: "Cart item removed." });
  }),

  /**
   * The cart is per-user, so this is session-gated like the real
   * CartController. A guest must never see a count fetched for someone else.
   *
   * TASK B4-1c: each line is enriched with its `product` from the detail pool
   * so the /cart page can render a name, image and price — the same `product`
   * shape CartController eager-loads. The badge only counts `items.length`, so
   * this addition is invisible to it.
   */
  http.get(CART_URL, () => {
    callCounts.cart += 1;
    if (!session.active) return unauthenticated();
    return HttpResponse.json({
      cart: {
        id: 1,
        user_id: testUser.id,
        items: cartItemsSource.map((item) => ({
          ...item,
          product: productDetailSource.find(
            (product) => product.id === item.product_id,
          ),
        })),
      },
    });
  }),
];
