import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet },
}));

import { getReviewShowcase } from "./review-showcase";
import type { ReviewShowcaseItem } from "./review-showcase";
import type { Paginator } from "./catalog";

const asset = {
  id: 5,
  uuid: "9f1c-uuid",
  disk: "public",
  path: "reviews/quote.png",
  thumbnail_path: null,
  url: "http://localhost:8000/storage/uploads/reviews/quote.png",
  thumbnail_url: null,
  original_name: "quote.png",
  mime_type: "image/png",
  size: 2048,
  width: 800,
  height: 600,
  alt_text: null,
};

const withCaption: ReviewShowcaseItem = {
  id: 1,
  asset_id: 5,
  caption: "Screenshot",
  display_order: 0,
  is_published: true,
  created_at: "2026-08-25T10:00:00.000000Z",
  updated_at: "2026-08-25T10:00:00.000000Z",
  asset,
};

/** `caption` is a nullable column, so a null is a first-class fixture. */
const withoutCaption: ReviewShowcaseItem = {
  ...withCaption,
  id: 2,
  asset_id: 6,
  caption: null,
  display_order: 1,
};

function paginator(items: ReviewShowcaseItem[]): Paginator<ReviewShowcaseItem> {
  return {
    data: items,
    links: [],
    current_page: 1,
    first_page_url: null,
    from: items.length ? 1 : null,
    last_page: 1,
    last_page_url: null,
    next_page_url: null,
    path: "http://localhost:8000/api/v1/review-showcase",
    per_page: 15,
    prev_page_url: null,
    to: items.length || null,
    total: items.length,
  };
}

describe("review-showcase", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("getReviewShowcase calls /review-showcase with no params when page is omitted", async () => {
    mockGet.mockResolvedValue({
      data: { review_showcase_items: paginator([withCaption]) },
    });

    const result = await getReviewShowcase();

    expect(mockGet).toHaveBeenCalledWith("/review-showcase", {
      params: undefined,
    });
    expect(result.review_showcase_items.data).toEqual([withCaption]);
  });

  it("getReviewShowcase passes page as a query param", async () => {
    mockGet.mockResolvedValue({
      data: { review_showcase_items: paginator([]) },
    });

    await getReviewShowcase(2);

    expect(mockGet).toHaveBeenCalledWith("/review-showcase", {
      params: { page: 2 },
    });
  });

  it("getReviewShowcase returns the whole envelope, not the inner paginator", async () => {
    const items = paginator([withCaption]);
    mockGet.mockResolvedValue({ data: { review_showcase_items: items } });

    const result = await getReviewShowcase();

    // The key is load-bearing: ReviewShowcaseController::index wraps the
    // paginator, it does not return it bare.
    expect(result).toEqual({ review_showcase_items: items });
  });

  it("getReviewShowcase handles a null caption", async () => {
    mockGet.mockResolvedValue({
      data: { review_showcase_items: paginator([withoutCaption]) },
    });

    const result = await getReviewShowcase();

    expect(result.review_showcase_items.data[0].caption).toBeNull();
  });

  it("getReviewShowcase surfaces pagination metadata from the paginator", async () => {
    mockGet.mockResolvedValue({
      data: { review_showcase_items: paginator([withCaption, withoutCaption]) },
    });

    const result = await getReviewShowcase();

    expect(result.review_showcase_items.total).toBe(2);
    expect(result.review_showcase_items.per_page).toBe(15);
    expect(result.review_showcase_items.current_page).toBe(1);
  });

  it("getReviewShowcase returns an empty gallery without throwing", async () => {
    mockGet.mockResolvedValue({
      data: { review_showcase_items: paginator([]) },
    });

    const result = await getReviewShowcase();

    expect(result.review_showcase_items.data).toEqual([]);
    expect(result.review_showcase_items.total).toBe(0);
  });

  it("getReviewShowcase propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("network down"));

    await expect(getReviewShowcase()).rejects.toThrow("network down");
  });
});
