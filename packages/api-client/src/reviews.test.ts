import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet, post: mockPost },
}));

import {
  getProductReviews,
  getServiceReviews,
  submitReview,
} from "./reviews";
import type { Review, ReviewItem, ReviewsResponse } from "./reviews";

const productReviewItem: ReviewItem = {
  id: 10,
  user_id: 4,
  product_id: 1,
  rating: 5,
  comment: "Great laptop.",
  verified_source: "order",
  created_at: "2026-09-15T10:00:00.000000Z",
  user: { id: 4, name: "Ali" },
};

const serviceReviewItem: ReviewItem = {
  id: 11,
  user_id: 4,
  service_id: 9,
  rating: 4,
  comment: "Fixed my printer quickly.",
  verified_source: "service_booking",
  created_at: "2026-09-16T10:00:00.000000Z",
  user: { id: 4, name: "Ali" },
};

const reviewsResponse: ReviewsResponse = {
  data: [productReviewItem],
  links: [],
  current_page: 1,
  first_page_url: null,
  from: 1,
  last_page: 1,
  last_page_url: null,
  next_page_url: null,
  path: "/api/v1/products/laptop/reviews",
  per_page: 15,
  prev_page_url: null,
  to: 1,
  total: 1,
};

const review: Review = {
  id: 10,
  user_id: 4,
  product_id: 1,
  service_id: null,
  rating: 5,
  comment: "Great laptop.",
  verified_source: "order",
  source_id: 22,
  is_published: true,
};

describe("reviews", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("getProductReviews calls the interpolated slug URL without params by default", async () => {
    mockGet.mockResolvedValue({ data: { reviews: reviewsResponse } });

    const result = await getProductReviews("laptop");

    expect(mockGet).toHaveBeenCalledWith("/products/laptop/reviews", {
      params: undefined,
    });
    expect(result).toEqual({ reviews: reviewsResponse });
  });

  it("getProductReviews passes page and per_page as query params", async () => {
    mockGet.mockResolvedValue({ data: { reviews: reviewsResponse } });

    await getProductReviews("laptop", 2, 10);

    expect(mockGet).toHaveBeenCalledWith("/products/laptop/reviews", {
      params: { page: 2, per_page: 10 },
    });
  });

  it("getServiceReviews calls the interpolated slug URL and returns the reviews envelope", async () => {
    mockGet.mockResolvedValue({
      data: { reviews: { ...reviewsResponse, data: [serviceReviewItem] } },
    });

    const result = await getServiceReviews("printer-repair");

    expect(mockGet).toHaveBeenCalledWith("/services/printer-repair/reviews", {
      params: undefined,
    });
    expect(result).toEqual({
      reviews: { ...reviewsResponse, data: [serviceReviewItem] },
    });
  });

  it("submitReview posts the payload to /reviews and returns the created review", async () => {
    mockPost.mockResolvedValue({ data: { review } });

    const result = await submitReview({
      rating: 5,
      comment: "Great laptop.",
      product_id: 1,
    });

    expect(mockPost).toHaveBeenCalledWith("/reviews", {
      rating: 5,
      comment: "Great laptop.",
      product_id: 1,
    });
    expect(result).toEqual({ review });
  });
});