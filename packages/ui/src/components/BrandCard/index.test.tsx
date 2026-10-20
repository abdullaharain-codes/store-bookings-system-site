import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, Brand } from "@ecommerce/api-client";
import { describe, expect, it, vi } from "vitest";
import { BrandCard } from "./index";

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 21,
    uuid: "f3d2b1e0-5c4a-4b3d-9f2e-1a8c7b6d5e4f",
    disk: "uploads",
    path: "brands/hp-logo.jpg",
    thumbnail_path: "brands/thumbs/hp-logo.jpg",
    url: "/storage/uploads/brands/hp-logo.jpg",
    thumbnail_url: "/storage/uploads/brands/thumbs/hp-logo.jpg",
    original_name: "hp-logo.jpg",
    mime_type: "image/jpeg",
    size: 4096,
    width: 400,
    height: 400,
    alt_text: null,
    ...overrides,
  };
}

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 1,
    name: "HP",
    slug: "hp",
    description: null,
    logo_asset_id: null,
    banner_asset_id: null,
    is_published: true,
    logo_asset: null,
    ...overrides,
  };
}

describe("BrandCard", () => {
  it("renders the brand name", () => {
    render(<BrandCard brand={makeBrand()} />);

    expect(screen.getByText("HP")).toBeInTheDocument();
  });

  it("renders the logo image as decorative (alt='' + src) when logo_asset is present", () => {
    const brand = makeBrand({ logo_asset: makeAsset() });
    const { container } = render(<BrandCard brand={brand} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/storage/uploads/brands/hp-logo.jpg");
    expect(img).toHaveAttribute("alt", "");
  });

  it("omits the image slot entirely (text-only tile) when logo_asset is absent", () => {
    const { container } = render(<BrandCard brand={makeBrand()} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("HP")).toBeInTheDocument();
  });

  it("treats the entire tile as a single click target via onActivate", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const { container } = render(
      <BrandCard brand={makeBrand({ logo_asset: makeAsset() })} onActivate={onActivate} />
    );

    await user.click(screen.getByText("HP"));
    expect(onActivate).toHaveBeenCalledTimes(1);

    const img = container.querySelector("img") as Element;
    await user.click(img);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("renders LoadingSkeleton and no brand content when isLoading is true", () => {
    render(<BrandCard brand={makeBrand()} isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("HP")).not.toBeInTheDocument();
  });
});