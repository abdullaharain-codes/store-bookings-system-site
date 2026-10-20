import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Category } from "@ecommerce/api-client";
import { CategoryBanner } from "./index";

const bannerCategory: Category = {
  id: 1,
  name: "Laptops",
  slug: "laptops",
  description: "Premium laptops",
  display_order: 1,
  is_published: true,
  parent_category_id: null,
  logo_asset: null,
  banner_asset: {
    id: 10,
    uuid: "banner-uuid",
    disk: "public",
    path: "/storage/banners/laptops.jpg",
    thumbnail_path: null,
    url: "/storage/banners/laptops.jpg",
    thumbnail_url: null,
    original_name: "laptops.jpg",
    mime_type: "image/jpeg",
    size: 102400,
    width: 2400,
    height: 800,
    alt_text: null,
  },
};

const noBannerCategory: Category = {
  id: 2,
  name: "Accessories",
  slug: "accessories",
  description: null,
  display_order: 2,
  is_published: true,
  parent_category_id: null,
  logo_asset: null,
  banner_asset: null,
};

describe("CategoryBanner", () => {
  it("renders the banner image with a decorative alt and the category name overlay", () => {
    render(<CategoryBanner category={bannerCategory} />);

    const image = document.querySelector("img") as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.getAttribute("src")).toBe("/storage/banners/laptops.jpg");
    expect(image.getAttribute("alt")).toBe("");

    const heading = screen.getByRole("heading", { level: 1, name: "Laptops" });
    expect(heading).toBeInTheDocument();
  });

  it("renders nothing when banner_asset is absent", () => {
    const { container } = render(<CategoryBanner category={noBannerCategory} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a LoadingSkeleton while isLoading, even before banner presence is known", () => {
    const { container } = render(
      <CategoryBanner category={noBannerCategory} isLoading />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Loading category banner")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});