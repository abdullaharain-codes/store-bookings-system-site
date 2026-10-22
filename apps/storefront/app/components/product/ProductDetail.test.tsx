import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  API_URL,
  CATEGORIES_URL,
  PRODUCTS_URL,
  SERVER_ORIGIN,
  callCounts,
  productDetailRequests,
} from "../../test/handlers";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import { ADD_TO_CART_SUCCESS_MESSAGE } from "../../hooks/useAddToCart";
import { ProductDetail } from "./ProductDetail";

/**
 * /product/:slug (TASK B3-2). Assertions are on roles, accessible names, image
 * sources and the recorded requests — never on class strings — so the page
 * stays usable if the reference styling is retuned.
 */

const IMAGE_BASE = `${SERVER_ORIGIN}/storage/uploads/products`;

type DetailProps = {
  onAddToCart?: (productId: number, quantity: number) => void;
  onWishlistToggle?: (productId: number) => void;
  onBuyNow?: (productId: number, quantity: number) => void;
  isWishlisted?: boolean;
  statusMessage?: string | null;
};

function renderDetail(slug: string, props: DetailProps = {}) {
  return renderWithProviders(<ProductDetail slug={slug} {...props} />, {
    entry: `/product/${slug}`,
  });
}

async function findHeading(name: string) {
  return screen.findByRole("heading", { level: 1, name });
}

describe("ProductDetail", () => {
  it("renders the name, brand link, SKU and an HTML-looking description as literal text", async () => {
    renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");

    expect(screen.getByRole("link", { name: "Dell" })).toHaveAttribute(
      "href",
      "/shop/brand/dell",
    );
    expect(screen.getByText("SKU: DX15-11")).toBeInTheDocument();

    // The description is plain text: it appears verbatim and no element is
    // created from the markup-looking characters.
    expect(screen.getByText("<b>Creator</b> laptop.")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("builds the breadcrumb chain for a 2-level category with the product as the non-link last item", async () => {
    renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    await within(breadcrumb).findByRole("link", { name: "Laptops" });

    const linkNames = within(breadcrumb)
      .getAllByRole("link")
      .map((element) => element.textContent);
    expect(linkNames).toEqual(["Home", "Shop", "Laptops", "Gaming Laptops"]);

    expect(within(breadcrumb).getByRole("link", { name: "Laptops" })).toHaveAttribute(
      "href",
      "/shop/category/laptops",
    );
    expect(
      within(breadcrumb).getByRole("link", { name: "Gaming Laptops" }),
    ).toHaveAttribute("href", "/shop/category/gaming-laptops");
    expect(within(breadcrumb).getByText("Dell XPS 15")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("falls back to Home > Shop > product name when the categories query errors", async () => {
    server.use(
      http.get(CATEGORIES_URL, () =>
        HttpResponse.json({ message: "Server Error" }, { status: 500 }),
      ),
    );

    renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");

    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading product" })).toBeNull());

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    const linkNames = within(breadcrumb)
      .getAllByRole("link")
      .map((element) => element.textContent);
    expect(linkNames).toEqual(["Home", "Shop"]);
    expect(within(breadcrumb).getByText("Dell XPS 15")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the discount block for a discounted product and nothing for a non-discounted one", async () => {
    const first = renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");

    expect(screen.getByText("Rs. 450,000")).toBeInTheDocument();
    expect(screen.getByText("-13%")).toBeInTheDocument();
    const original = screen.getByText(/Rs\. 520,000$/);
    expect(original).toHaveClass("line-through");
    expect(screen.getByText("Original price:")).toBeInTheDocument();
    first.unmount();

    renderDetail("dell-latitude-5440");
    await findHeading("Dell Latitude 5440");

    expect(screen.getByText("Rs. 210,000")).toBeInTheDocument();
    expect(screen.queryByText("Original price:")).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
  });

  it("renders one thumbnail per image and swaps the main image on click", async () => {
    const user = userEvent.setup();
    renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");

    const thumbnails = screen.getAllByRole("button", {
      name: /^Show image \d+ of \d+$/,
    });
    expect(thumbnails).toHaveLength(3);
    expect(screen.getByAltText("Dell XPS 15")).toHaveAttribute(
      "src",
      `${IMAGE_BASE}/dell-xps-15-1.jpg`,
    );

    await user.click(screen.getByRole("button", { name: "Show image 2 of 3" }));

    expect(screen.getByAltText("Dell XPS 15")).toHaveAttribute(
      "src",
      `${IMAGE_BASE}/dell-xps-15-2.jpg`,
    );
    expect(screen.getByRole("button", { name: "Show image 2 of 3" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("renders no thumbnail strip for a single image", async () => {
    renderDetail("hp-spectre-x360");
    await findHeading("HP Spectre x360");
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading product" })).toBeNull());

    expect(
      screen.queryByRole("button", { name: /^Show image/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByAltText("HP Spectre x360")).toBeInTheDocument();
  });

  it("renders a neutral placeholder when the product has no images", async () => {
    renderDetail("hp-elitebook-840");
    await findHeading("HP EliteBook 840");
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading product" })).toBeNull());

    expect(screen.getByText("No image")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Show image/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the server stock state and disables Add to Cart + quantity when out of stock", async () => {
    const first = renderDetail("dell-xps-15", { onAddToCart: vi.fn() });
    await findHeading("Dell XPS 15");

    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Cart" })).not.toBeDisabled();
    first.unmount();

    renderDetail("dell-latitude-5440", { onAddToCart: vi.fn() });
    await findHeading("Dell Latitude 5440");

    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Cart" })).toBeDisabled();
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
  });

  it("keeps a string draft while typing and clamps to [1, stock_quantity] on blur and on +/-", async () => {
    const user = userEvent.setup();
    renderDetail("dell-xps-15", { onAddToCart: vi.fn() });
    await findHeading("Dell XPS 15");

    const quantity = screen.getByLabelText("Quantity");

    // Clearing the field leaves it empty — it must not snap to 1 mid-edit.
    await user.clear(quantity);
    expect(quantity).toHaveValue(null);

    // A valid typed value is kept as-is.
    await user.type(quantity, "3");
    expect(quantity).toHaveValue(3);

    // An over-max draft is left alone until blur, then clamped to stock.
    fireEvent.change(quantity, { target: { value: "999" } });
    expect(quantity).toHaveValue(999);
    fireEvent.blur(quantity);
    expect(quantity).toHaveValue(4);

    // An empty/invalid draft resets to 1 on blur.
    fireEvent.change(quantity, { target: { value: "" } });
    fireEvent.blur(quantity);
    expect(quantity).toHaveValue(1);

    // +/- stay clamped within [1, stock_quantity].
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(quantity).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantity).toHaveValue(2);
    fireEvent.change(quantity, { target: { value: "4" } });
    fireEvent.blur(quantity);
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(quantity).toHaveValue(4);
  });

  it("renders a loading skeleton before the product resolves", async () => {
    renderDetail("dell-xps-15");

    expect(
      screen.getByRole("status", { name: "Loading product" }),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading product" })).toBeNull());
    await findHeading("Dell XPS 15");
  });

  it("renders the not-found state with a noindex meta, a /shop link and the title", async () => {
    renderDetail("no-such-product");

    await findHeading("Product not found");
    expect(
      document.head.querySelector('meta[name="robots"][content="noindex"]'),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to shop" })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(document.title).toBe("Product not found | TechFix");
  });

  it("renders a retryable error state that refetches only the product request", async () => {
    const user = userEvent.setup();
    let detailCalls = 0;
    server.use(
      http.get(`${PRODUCTS_URL}/dell-xps-15`, () => {
        detailCalls += 1;
        return HttpResponse.json({ message: "Server Error" }, { status: 500 });
      }),
    );

    renderDetail("dell-xps-15");

    const alert = await screen.findByRole("alert");
    // No raw server text leaks into the page.
    expect(alert).not.toHaveTextContent("Server Error");
    expect(screen.queryByText("Server Error")).not.toBeInTheDocument();

    const categoriesAfterLoad = callCounts.categories;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(detailCalls).toBe(2));
    expect(callCounts.categories).toBe(categoriesAfterLoad);
  });

  it("renders exactly one h1 in every state and sets the document title", async () => {
    const success = renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.title).toBe("Dell XPS 15 | TechFix");
    success.unmount();

    const loading = renderDetail("dell-xps-15");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    loading.unmount();

    renderDetail("no-such-product");
    await findHeading("Product not found");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("keeps an out-of-stock product's Add to Cart inert even with handlers wired, and makes no cart/wishlist request", async () => {
    const onAddToCart = vi.fn();
    const onWishlistToggle = vi.fn();
    const wishlistRequests: string[] = [];
    server.use(
      http.post(`${API_URL}/wishlist/:id`, ({ request }) => {
        wishlistRequests.push(request.url);
        return HttpResponse.json({ is_wishlisted: true });
      }),
    );

    renderDetail("dell-latitude-5440", { onAddToCart, onWishlistToggle });
    await findHeading("Dell Latitude 5440");

    const addToCart = screen.getByRole("button", { name: "Add to Cart" });
    expect(addToCart).toBeDisabled();
    fireEvent.click(addToCart);
    expect(onAddToCart).not.toHaveBeenCalled();

    expect(onWishlistToggle).not.toHaveBeenCalled();
    expect(wishlistRequests).toHaveLength(0);
    expect(callCounts.cartItems).toBe(0);
    expect(callCounts.cart).toBe(0);
    expect(productDetailRequests).toHaveLength(1);
  });

  it("disables both cart and wishlist buttons when no handlers are wired, issuing no requests", async () => {
    const wishlistRequests: string[] = [];
    server.use(
      http.post(`${API_URL}/wishlist/:id`, ({ request }) => {
        wishlistRequests.push(request.url);
        return HttpResponse.json({ is_wishlisted: true });
      }),
    );

    renderDetail("dell-xps-15");
    await findHeading("Dell XPS 15");

    const addToCart = screen.getByRole("button", { name: "Add to Cart" });
    const wishlist = screen.getByRole("button", { name: "Add to wishlist" });
    expect(addToCart).toBeDisabled();
    expect(wishlist).toBeDisabled();

    fireEvent.click(addToCart);
    fireEvent.click(wishlist);

    expect(callCounts.cartItems).toBe(0);
    expect(callCounts.cart).toBe(0);
    expect(wishlistRequests).toHaveLength(0);
    expect(productDetailRequests).toHaveLength(1);
  });

  it("renders the add-to-cart success message inside the Purchase options group", async () => {
    renderDetail("dell-xps-15", {
      onAddToCart: vi.fn(),
      statusMessage: ADD_TO_CART_SUCCESS_MESSAGE,
    });
    await findHeading("Dell XPS 15");

    const group = screen.getByRole("group", { name: "Purchase options" });
    expect(within(group).getByRole("status")).toHaveTextContent(
      ADD_TO_CART_SUCCESS_MESSAGE,
    );
  });

  it("renders a server stock error inside the Purchase options group", async () => {
    renderDetail("dell-xps-15", {
      onAddToCart: vi.fn(),
      statusMessage: "Only 3 left in stock.",
    });
    await findHeading("Dell XPS 15");

    const group = screen.getByRole("group", { name: "Purchase options" });
    expect(within(group).getByRole("status")).toHaveTextContent(
      "Only 3 left in stock.",
    );
  });

  it("always renders an empty status inside the Purchase options group when there is no message", async () => {
    renderDetail("dell-xps-15", { onAddToCart: vi.fn() });
    await findHeading("Dell XPS 15");

    const group = screen.getByRole("group", { name: "Purchase options" });
    expect(within(group).getByRole("status")).toBeEmptyDOMElement();
  });

  it("labels the wishlist button from isWishlisted and calls the toggle", async () => {
    const onWishlistToggle = vi.fn();
    const user = userEvent.setup();

    const first = renderDetail("dell-xps-15", {
      onWishlistToggle,
      isWishlisted: false,
    });
    await findHeading("Dell XPS 15");
    const add = screen.getByRole("button", { name: "Add to wishlist" });
    await user.click(add);
    expect(onWishlistToggle).toHaveBeenCalledWith(11);
    first.unmount();

    renderDetail("dell-xps-15", {
      onWishlistToggle,
      isWishlisted: true,
    });
    await findHeading("Dell XPS 15");
    expect(
      screen.getByRole("button", { name: "Remove from wishlist" })
    ).toBeInTheDocument();
  });

  it("renders a Buy now action that hands the chosen quantity to onBuyNow", async () => {
    const onBuyNow = vi.fn();
    const user = userEvent.setup();
    renderDetail("dell-xps-15", { onAddToCart: vi.fn(), onBuyNow });
    await findHeading("Dell XPS 15");

    const quantity = screen.getByLabelText("Quantity");
    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.blur(quantity);

    await user.click(screen.getByRole("button", { name: "Buy now" }));
    expect(onBuyNow).toHaveBeenCalledWith(11, 3);
  });

  it("disables Buy now when no handler is wired or the product is out of stock", async () => {
    const first = renderDetail("dell-xps-15", { onAddToCart: vi.fn() });
    await findHeading("Dell XPS 15");
    expect(screen.getByRole("button", { name: "Buy now" })).toBeDisabled();
    first.unmount();

    renderDetail("dell-latitude-5440", {
      onAddToCart: vi.fn(),
      onBuyNow: vi.fn(),
    });
    await findHeading("Dell Latitude 5440");
    expect(screen.getByRole("button", { name: "Buy now" })).toBeDisabled();
  });
});
