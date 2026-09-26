import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, Category } from "@ecommerce/api-client";
import { describe, expect, it, vi } from "vitest";
import { CategoryCard } from "./index";

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 11,
    uuid: "c991a52a-71e2-4f1a-9e2b-3f6a9c4e2b11",
    disk: "uploads",
    path: "categories/laptops-logo.jpg",
    thumbnail_path: "categories/thumbs/laptops-logo.jpg",
    original_name: "laptops-logo.jpg",
    mime_type: "image/jpeg",
    size: 2048,
    width: 800,
    height: 600,
    alt_text: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 3,
    name: "Laptops",
    slug: "laptops",
    description: null,
    display_order: 1,
    is_published: true,
    parent_category_id: null,
    logo_asset: null,
    banner_asset: null,
    ...overrides,
  };
}

describe("CategoryCard", () => {
  it("renders the category name as a heading and a placeholder visual when logo_asset is null", () => {
    const { container } = render(<CategoryCard category={makeCategory()} />);

    expect(screen.getByRole("heading", { name: "Laptops" })).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders the real logo image with an alt equal to the category name when logo_asset is present", () => {
    const category = makeCategory({ logo_asset: makeAsset() });

    render(<CategoryCard category={category} />);

    const img = screen.getByRole("img", { name: "Laptops" });
    expect(img).toHaveAttribute("src", "categories/laptops-logo.jpg");
  });

  it("renders a neutral placeholder, never a broken image, when logo_asset is absent", () => {
    const { container } = render(<CategoryCard category={makeCategory()} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("renders itemCount as secondary text when provided and nothing when omitted", () => {
    const { rerender } = render(<CategoryCard category={makeCategory()} itemCount={24} />);
    expect(screen.getByText("24 products")).toBeInTheDocument();

    rerender(<CategoryCard category={makeCategory()} />);
    expect(screen.queryByText(/products?/i)).not.toBeInTheDocument();
  });

  it("treats the entire card as a single click target via onActivate", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { container } = render(
      <CategoryCard category={makeCategory()} onActivate={onActivate} />
    );

    await user.click(screen.getByRole("heading", { name: "Laptops" }));
    expect(onActivate).toHaveBeenCalledTimes(1);

    const placeholder = container.querySelector('[aria-hidden="true"]') as Element;
    await user.click(placeholder);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("renders LoadingSkeleton and no category content when isLoading is true", () => {
    render(<CategoryCard category={makeCategory()} isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Laptops" })).not.toBeInTheDocument();
  });
});