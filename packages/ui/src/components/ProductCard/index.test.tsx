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
    stock_quantity: 10,
    brand_id: 1,
    is_published: true,
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
    expect(screen.getByText("Rs. 128,501")).toBeInTheDocument();
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

  it("renders discount badge and strikethrough only when compareAtPrice exceeds price", () => {
    const { rerender } = render(
      <ProductCard product={makeProduct()} compareAtPrice="200000" />
    );

    expect(screen.getByText("-25%")).toBeInTheDocument();
    const original = screen.getByText("Rs. 200,000");
    expect(original).toBeInTheDocument();
    expect(original).toHaveClass("line-through");

    rerender(<ProductCard product={makeProduct()} />);
    expect(screen.queryByText("-25%")).not.toBeInTheDocument();
    expect(screen.queryByText("Rs. 200,000")).not.toBeInTheDocument();

    rerender(<ProductCard product={makeProduct({ price: "200000" })} compareAtPrice="200000" />);
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
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
});