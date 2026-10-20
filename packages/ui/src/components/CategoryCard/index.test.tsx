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
    url: "/storage/uploads/categories/laptops-logo.jpg",
    thumbnail_url: "/storage/uploads/categories/thumbs/laptops-logo.jpg",
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
  it("renders the category name", () => {
    render(<CategoryCard category={makeCategory()} />);

    expect(screen.getByText("Laptops")).toBeInTheDocument();
  });

  it("renders the logo image as decorative (alt='' + src) when logo_asset is present", () => {
    const category = makeCategory({ logo_asset: makeAsset() });
    const { container } = render(<CategoryCard category={category} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/storage/uploads/categories/laptops-logo.jpg");
    expect(img).toHaveAttribute("alt", "");
  });

  it("omits the image slot entirely (text-only pill) when logo_asset is absent", () => {
    const { container } = render(<CategoryCard category={makeCategory()} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Laptops")).toBeInTheDocument();
  });

  it("treats the entire pill as a single click target via onActivate", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { container } = render(
      <CategoryCard
        category={makeCategory({ logo_asset: makeAsset() })}
        onActivate={onActivate}
      />
    );

    await user.click(screen.getByText("Laptops"));
    expect(onActivate).toHaveBeenCalledTimes(1);

    const img = container.querySelector("img") as Element;
    await user.click(img);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("renders LoadingSkeleton and no category content when isLoading is true", () => {
    render(<CategoryCard category={makeCategory()} isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Laptops")).not.toBeInTheDocument();
  });
});