import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Product } from "@ecommerce/api-client";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "./index";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Latitude 7450",
    slug: "latitude-7450",
    sku: "LAT-1",
    description: "A productivity laptop.",
    price: "150000",
    compare_at_price: null,
    discount_percent: null,
    stock_quantity: 10,
    brand_id: 1,
    is_published: true,
    is_featured: false,
    brand: {
      id: 1,
      name: "Dell",
      slug: "dell",
      description: null,
      logo_asset_id: null,
      banner_asset_id: null,
      is_published: true,
    },
    categories: [],
    images: [
      {
        id: 1,
        product_id: 1,
        asset_id: 1,
        display_order: 0,
        asset: {
          id: 1,
          uuid: "9ce5b8c1-0000-0000-0000-000000000001",
          disk: "public",
          path: "/storage/products/latitude.jpg",
          thumbnail_path: null,
          url: "/storage/products/latitude.jpg",
          thumbnail_url: null,
          original_name: "latitude.jpg",
          mime_type: "image/jpeg",
          size: 1024,
          width: 800,
          height: 600,
          alt_text: null,
        },
      },
    ],
    ...overrides,
  };
}

describe("ProductCard", () => {
  it("renders product name, formatted price, and brand name when present", () => {
    const { rerender } = render(<ProductCard product={makeProduct()} />);

    expect(screen.getByText("Latitude 7450")).toBeInTheDocument();
    expect(screen.getByText("Rs. 150,000")).toBeInTheDocument();
    expect(screen.getByText("Dell")).toBeInTheDocument();

    rerender(<ProductCard product={makeProduct({ price: "128500.50" })} />);
    expect(screen.getByText("Rs. 128,500.50")).toBeInTheDocument();
  });

  it("does not render a brand name when product.brand is null", () => {
    render(<ProductCard product={makeProduct({ brand: null })} />);

    expect(screen.queryByText("Dell")).not.toBeInTheDocument();
  });

  it("renders Out of Stock badge and disables Add to Cart when stock_quantity is 0", () => {
    const onAddToCart = vi.fn();
    render(
      <ProductCard product={makeProduct({ stock_quantity: 0 })} onAddToCart={onAddToCart} />
    );

    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Cart" })).toBeDisabled();
  });

  it("renders Low Stock badge when stock_quantity is at or under the threshold", () => {
    const { rerender } = render(<ProductCard product={makeProduct({ stock_quantity: 5 })} />);
    expect(screen.getByText("Low Stock")).toBeInTheDocument();

    rerender(<ProductCard product={makeProduct({ stock_quantity: 3 })} />);
    expect(screen.getByText("Low Stock")).toBeInTheDocument();
  });

  it("renders In Stock badge when stock_quantity exceeds the threshold", () => {
    render(<ProductCard product={makeProduct({ stock_quantity: 6 })} />);
    expect(screen.getByText("In Stock")).toBeInTheDocument();
  });

  it("renders discount badge and strikethrough when the product carries a discount", () => {
    const { rerender } = render(
      <ProductCard
        product={makeProduct({
          price: "150000",
          compare_at_price: "200000",
          discount_percent: 25,
        })}
      />
    );

    expect(screen.getByText("-25%")).toBeInTheDocument();
    const original = screen.getByText(/Rs\. 200,000$/);
    expect(original).toBeInTheDocument();
    expect(original).toHaveClass("line-through");

    // The visually-hidden label keeps the aria read-out "Original price:
    // Rs. 200,000" instead of an unexplained crossed-out number.
    expect(screen.getByText("Original price:")).toBeInTheDocument();

    // No discount fields -> no discount UI at all.
    rerender(<ProductCard product={makeProduct()} />);
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Original price:")).not.toBeInTheDocument();

    // compare_at_price present but discount_percent null (server computed no
    // discount): the card must branch on the server value, not the raw price.
    rerender(
      <ProductCard
        product={makeProduct({
          price: "200000",
          compare_at_price: "200000",
          discount_percent: null,
        })}
      />
    );
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Original price:")).not.toBeInTheDocument();
  });

  it("renders rating stars and review count when averageRating is provided", () => {
    render(<ProductCard product={makeProduct()} averageRating={4} reviewCount={23} />);

    expect(screen.getByLabelText("Rated 4 out of 5")).toBeInTheDocument();
    expect(screen.getByText("(23)")).toBeInTheDocument();
  });

  it("does not render a rating section when averageRating is omitted", () => {
    render(<ProductCard product={makeProduct()} reviewCount={23} />);

    expect(screen.queryByLabelText(/Rated \d out of 5/)).not.toBeInTheDocument();
    expect(screen.queryByText("(23)")).not.toBeInTheDocument();
  });

  it("calls onWishlistToggle with the product id when the wishlist button is clicked", async () => {
    const user = userEvent.setup();
    const onWishlistToggle = vi.fn();
    render(
      <ProductCard
        product={makeProduct()}
        isAuthenticated
        onWishlistToggle={onWishlistToggle}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add to wishlist" }));
    expect(onWishlistToggle).toHaveBeenCalledWith(1);
  });

  it("calls onAddToCart with the product id when Add to Cart is clicked", async () => {
    const user = userEvent.setup();
    const onAddToCart = vi.fn();
    render(<ProductCard product={makeProduct()} onAddToCart={onAddToCart} />);

    await user.click(screen.getByRole("button", { name: "Add to Cart" }));
    expect(onAddToCart).toHaveBeenCalledWith(1);
  });

  it("calls onViewDetails when the image or name area is clicked, without triggering wishlist or cart handlers", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const onWishlistToggle = vi.fn();
    const onAddToCart = vi.fn();
    render(
      <ProductCard
        product={makeProduct()}
        onViewDetails={onViewDetails}
        onWishlistToggle={onWishlistToggle}
        onAddToCart={onAddToCart}
      />
    );

    await user.click(screen.getByAltText("Latitude 7450"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("Latitude 7450"));
    expect(onViewDetails).toHaveBeenCalledTimes(2);

    expect(onWishlistToggle).not.toHaveBeenCalled();
    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it("renders LoadingSkeleton and none of the product content when isLoading is true", () => {
    render(<ProductCard product={makeProduct()} isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Latitude 7450")).not.toBeInTheDocument();
    expect(screen.queryByText("Rs. 150,000")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("wires the hover treatment classes (image zoom + card lift) that jsdom cannot exercise at runtime", () => {
    const { container } = render(<ProductCard product={makeProduct()} />);

    // The card lift now comes from Card's `interactive` prop (ProductCard passes
    // `interactive`), so these classes live on the rendered Card root.
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("hover:shadow-[var(--shadow-hover)]");
    expect(card.className).toContain("hover:-translate-y-0.5");
    expect(card.className).toContain("transition-[box-shadow,transform]");

    const image = screen.getByAltText("Latitude 7450");
    expect(image.className).toContain("group-hover:scale-105");
    expect(image.className).toContain("mix-blend-darken");
    expect(image.className).toContain("object-contain");
  });

  // ─── href (TASK B2c) ──────────────────────────────────────────────────────

  describe("optional href", () => {
    it("renders the image and title as real links to href when it is given", () => {
      render(<ProductCard product={makeProduct()} href="/product/latitude-7450" />);

      // Both main-action areas (the image target and the title block) must
      // carry the destination, not just one of them.
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", "/product/latitude-7450");
      }
      expect(screen.getByAltText("Latitude 7450").closest("a")).toHaveAttribute(
        "href",
        "/product/latitude-7450",
      );
      expect(screen.getByText("Latitude 7450").closest("a")).toHaveAttribute(
        "href",
        "/product/latitude-7450",
      );
    });

    it("keeps href=\"#\" on the main action when no href is given", () => {
      const onViewDetails = vi.fn();
      render(<ProductCard product={makeProduct()} onViewDetails={onViewDetails} />);

      // Unchanged legacy behaviour: the anchor is still a click-handler
      // placeholder, because that is what every pre-B2c caller passes.
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", "#");
      }
    });

    it("still fires onViewDetails alongside href so an SPA router can intercept the click", async () => {
      const user = userEvent.setup();
      const onViewDetails = vi.fn();
      render(
        <ProductCard
          product={makeProduct()}
          href="/product/latitude-7450"
          onViewDetails={onViewDetails}
        />,
      );

      await user.click(screen.getByText("Latitude 7450"));

      // The href is in the DOM for crawlers/middle-click, but the click must not
      // become a full document navigation in an SPA.
      expect(onViewDetails).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Latitude 7450").closest("a")).toHaveAttribute(
        "href",
        "/product/latitude-7450",
      );
    });

    it("renders no main-action link at all when neither href nor onViewDetails is given", () => {
      render(<ProductCard product={makeProduct()} />);

      // No handler and no href means there is nothing to link to, so the wrapper
      // must not become a focusable dead link.
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});