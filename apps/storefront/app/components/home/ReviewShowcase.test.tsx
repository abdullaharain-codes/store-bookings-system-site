import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewShowcaseItem } from "@ecommerce/api-client";
import {
  REVIEW_SHOWCASE_URL,
  reviewShowcaseRequests,
} from "../../test/handlers";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import { ReviewShowcase } from "./ReviewShowcase";

function makeItem(
  id: number,
  overrides: Partial<ReviewShowcaseItem> = {},
): ReviewShowcaseItem {
  return {
    id,
    asset_id: 100 + id,
    caption: null,
    display_order: id,
    is_published: true,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
    asset: {
      id: 100 + id,
      uuid: `5a6f1c2e-8b3d-4a91-9f77-${id}`,
      disk: "public",
      path: `reviews/full-${id}.jpg`,
      thumbnail_path: `reviews/thumb-${id}.jpg`,
      url: `/storage/uploads/reviews/full-${id}.jpg`,
      thumbnail_url: `/storage/uploads/reviews/thumb-${id}.jpg`,
      original_name: `full-${id}.jpg`,
      mime_type: "image/jpeg",
      size: 204800,
      width: 1200,
      height: 800,
      alt_text: `Alt text ${id}`,
    },
    ...overrides,
  };
}

function envelope(items: ReviewShowcaseItem[]) {
  return {
    review_showcase_items: {
      data: items,
      links: [],
      current_page: 1,
      first_page_url: null,
      from: items.length ? 1 : null,
      last_page: Math.max(1, items.length),
      last_page_url: null,
      next_page_url: null,
      path: REVIEW_SHOWCASE_URL,
      per_page: 15,
      prev_page_url: null,
      to: items.length || null,
      total: items.length,
    },
  };
}

function useReviewShowcase(items: ReviewShowcaseItem[]) {
  server.use(
    http.get(REVIEW_SHOWCASE_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      reviewShowcaseRequests.push({ params });
      return HttpResponse.json(envelope(items));
    }),
  );
}

const LG = (query: string) => query === "(min-width: 1024px)";
const NONE = () => false;

// jsdom does not implement matchMedia, yet every render (the Carousel, and the
// per-view grouping hook) touches it — see routes/_index.test.tsx.
function createMatchMediaStub(matches: (query: string) => boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", createMatchMediaStub(LG));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReviewShowcase", () => {
  it("groups 7 items into slides of 3, 3, 1 at desktop widths, in API order", async () => {
    vi.stubGlobal("matchMedia", createMatchMediaStub(LG));
    useReviewShowcase(Array.from({ length: 7 }, (_, i) => makeItem(i + 1)));

    renderWithProviders(<ReviewShowcase />);

    await screen.findByRole("button", { name: "Enlarge: Alt text 1" });

    for (const n of ["1", "2", "3"]) {
      expect(
        screen.getByRole("button", { name: `Slide ${n} of 3` }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Slide 4 of 3" })).not.toBeInTheDocument();

    const enlargeButtons = screen.getAllByRole("button", { name: /^Enlarge: / });
    expect(enlargeButtons.map((b) => b.getAttribute("aria-label"))).toEqual(
      Array.from({ length: 7 }, (_, i) => `Enlarge: Alt text ${i + 1}`),
    );
  });

  it("switches to one item per slide below sm, producing 7 slides", async () => {
    vi.stubGlobal("matchMedia", createMatchMediaStub(NONE));
    useReviewShowcase(Array.from({ length: 7 }, (_, i) => makeItem(i + 1)));

    renderWithProviders(<ReviewShowcase />);

    await screen.findByRole("button", { name: "Enlarge: Alt text 1" });

    for (const n of ["1", "2", "3", "4", "5", "6", "7"]) {
      expect(
        screen.getByRole("button", { name: `Slide ${n} of 7` }),
      ).toBeInTheDocument();
    }
  });

  it("falls back the alt through alt_text, then caption, then a generic string", async () => {
    vi.stubGlobal("matchMedia", createMatchMediaStub(LG));
    useReviewShowcase([
      makeItem(1),
      makeItem(2, {
        asset: {
          ...makeItem(2).asset,
          alt_text: null,
        },
        caption: "A caption",
      }),
      makeItem(3, {
        asset: {
          ...makeItem(3).asset,
          alt_text: null,
        },
        caption: null,
      }),
    ]);

    renderWithProviders(<ReviewShowcase />);

    const first = await screen.findByRole("button", { name: "Enlarge: Alt text 1" });
    expect(within(first).getByRole("img")).toHaveAccessibleName("Alt text 1");

    const second = screen.getByRole("button", { name: "Enlarge: A caption" });
    expect(within(second).getByRole("img")).toHaveAccessibleName("A caption");

    const third = screen.getByRole("button", {
      name: "Enlarge: Customer review screenshot",
    });
    expect(within(third).getByRole("img")).toHaveAccessibleName(
      "Customer review screenshot",
    );
  });

  it("uses thumbnail_url in the strip and always the full url in the lightbox", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", createMatchMediaStub(LG));
    useReviewShowcase([
      makeItem(1),
      makeItem(2, {
        asset: {
          ...makeItem(2).asset,
          thumbnail_url: null,
        },
      }),
    ]);

    renderWithProviders(<ReviewShowcase />);

    const first = await screen.findByRole("button", { name: "Enlarge: Alt text 1" });
    const firstImg = within(first).getByRole("img");
    expect(firstImg).toHaveAttribute("src", "/storage/uploads/reviews/thumb-1.jpg");
    expect(firstImg).toHaveAttribute("width", "1200");
    expect(firstImg).toHaveAttribute("height", "800");

    const second = screen.getByRole("button", { name: "Enlarge: Alt text 2" });
    const secondImg = within(second).getByRole("img");
    expect(secondImg).toHaveAttribute("src", "/storage/uploads/reviews/full-2.jpg");

    await user.click(second);
    const dialog = screen.getByRole("dialog", {
      name: "Customer review: Alt text 2",
    });
    expect(within(dialog).getByRole("img")).toHaveAttribute(
      "src",
      "/storage/uploads/reviews/full-2.jpg",
    );
  });

  it("opens the lightbox with the clicked item, closes on Escape, and returns focus", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", createMatchMediaStub(LG));
    useReviewShowcase([
      makeItem(1, { caption: "Love this setup" }),
    ]);

    renderWithProviders(<ReviewShowcase />);

    const button = await screen.findByRole("button", { name: "Enlarge: Alt text 1" });
    button.focus();
    await user.click(button);

    const dialog = await screen.findByRole("dialog", {
      name: "Customer review: Alt text 1",
    });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "/storage/uploads/reviews/full-1.jpg");
    expect(within(dialog).getByText("Love this setup")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enlarge: Alt text 1" }),
    ).toHaveFocus();
  });

  it("shows a status skeleton while loading", async () => {
    server.use(
      http.get(REVIEW_SHOWCASE_URL, () => new Promise(() => {})),
    );

    renderWithProviders(<ReviewShowcase />);

    expect(
      await screen.findByRole("status", { name: "Loading customer reviews" }),
    ).toBeInTheDocument();
  });

  it("shows an error with retry when the showcase fails, and recovers", async () => {
    let attempts = 0;
    server.use(
      http.get(REVIEW_SHOWCASE_URL, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ message: "boom" }, { status: 500 });
        }
        return HttpResponse.json(envelope([makeItem(1)]));
      }),
    );

    renderWithProviders(<ReviewShowcase />);

    expect(
      await screen.findByRole("heading", { name: "Customer reviews unavailable" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(
      await screen.findByRole("button", { name: "Enlarge: Alt text 1" }),
    ).toBeInTheDocument();
  });

  it("omits the whole section when the API returns no items", async () => {
    useReviewShowcase([]);

    renderWithProviders(<ReviewShowcase />);

    // Empty, not pending: wait for the request AND for every status role to be
    // gone before asserting absence, so the test cannot pass vacuously while a
    // skeleton is still showing.
    await waitFor(() => {
      expect(reviewShowcaseRequests.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.queryAllByRole("status")).toHaveLength(0);
    });

    expect(
      screen.queryByRole("heading", { name: "What Our Customers Say" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Customer reviews" }),
    ).not.toBeInTheDocument();
  });

  it("renders the copy the task specified and none of the forbidden fake stats", async () => {
    vi.stubGlobal("matchMedia", createMatchMediaStub(LG));
    useReviewShowcase([makeItem(1), makeItem(2), makeItem(3)]);

    renderWithProviders(<ReviewShowcase />);

    expect(
      await screen.findByRole("heading", { name: "What Our Customers Say" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Customer reviews" }),
    ).toBeInTheDocument();

    for (const needle of [/1M\+/, /Cities Covered/, /5 Star/]) {
      expect(screen.queryByText(needle)).not.toBeInTheDocument();
    }
  });
});