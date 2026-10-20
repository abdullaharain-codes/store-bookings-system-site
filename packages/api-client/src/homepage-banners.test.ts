import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet },
}));

import { getHomepageBanners } from "./homepage-banners";
import type { HomepageBanner } from "./homepage-banners";

const banner: HomepageBanner = {
  id: 3,
  asset_id: 11,
  target_category_id: 2,
  display_order: 0,
  is_published: true,
  start_at: null,
  end_at: null,
  created_at: "2026-08-25T10:00:00.000000Z",
  updated_at: "2026-08-25T10:00:00.000000Z",
  headline: "Summer laptop sale",
  subtitle: "Up to 40% off selected models.",
  asset: {
    id: 11,
    uuid: "9f1c2a3b-4d5e-4f6a-8b7c-1d2e3f4a5b6c",
    disk: "public",
    path: "homepage/laptop-repair-hero.png",
    thumbnail_path: null,
    url: "http://localhost:8000/storage/uploads/homepage/laptop-repair-hero.png",
    thumbnail_url: null,
    original_name: "laptop-repair-hero.png",
    mime_type: "image/png",
    size: 254871,
    width: 2400,
    height: 1200,
    alt_text: "Laptop screen replacement showcase",
  },
  target_category: {
    id: 2,
    name: "Laptop Repairs",
    slug: "laptop-repairs",
    description: "Screen, keyboard and battery repairs.",
    display_order: 0,
    is_published: true,
    parent_category_id: null,
    logo_asset: null,
    banner_asset: null,
  },
};

describe("homepage-banners", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("getHomepageBanners calls /homepage-banners and unwraps data.banners", async () => {
    mockGet.mockResolvedValue({ data: { banners: [banner, { ...banner, id: 4 }] } });

    const result = await getHomepageBanners();

    expect(mockGet).toHaveBeenCalledWith("/homepage-banners");
    expect(result).toEqual([banner, { ...banner, id: 4 }]);
  });

  it("keeps the nested asset and live target category slug the frontend navigates by", async () => {
    mockGet.mockResolvedValue({ data: { banners: [banner] } });

    const [first] = await getHomepageBanners();

    expect(first.asset.path).toBe("homepage/laptop-repair-hero.png");
    expect(first.asset.id).toBe(11);
    expect(first.target_category.slug).toBe("laptop-repairs");
    expect(first.target_category.id).toBe(2);
    expect(first.target_category.is_published).toBe(true);
  });

  // ─── overlay text (TASK B2c) ─────────────────────────────────────────────

  it("carries the optional overlay headline and subtitle through unchanged", async () => {
    mockGet.mockResolvedValue({ data: { banners: [banner] } });

    const [first] = await getHomepageBanners();

    expect(first.headline).toBe("Summer laptop sale");
    expect(first.subtitle).toBe("Up to 40% off selected models.");
  });

  it("keeps both overlay keys as null for an image-only banner rather than dropping them", async () => {
    // BE1: NULL headline+subtitle is an authorable state ("image only"), the
    // common case — so a client must be able to branch on null without probing
    // for key existence.
    const imageOnly: HomepageBanner = {
      ...banner,
      id: 5,
      headline: null,
      subtitle: null,
    };
    mockGet.mockResolvedValue({ data: { banners: [imageOnly] } });

    const [first] = await getHomepageBanners();

    expect(first.headline).toBeNull();
    expect(first.subtitle).toBeNull();
    expect(Object.keys(first)).toEqual(expect.arrayContaining(["headline", "subtitle"]));
  });
});