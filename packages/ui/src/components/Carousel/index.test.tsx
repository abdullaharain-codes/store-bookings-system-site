import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselSlide } from "./index";
import { Carousel } from "./index";

function makeSlides(count = 4): CarouselSlide[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    content: <span>Slide {i}</span>,
    alt: `Slide ${i}`,
  }));
}

function mockMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("Carousel", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("auto-slide", () => {
    it("advances on the interval and loops back to the first slide", () => {
      vi.useFakeTimers();
      render(<Carousel slides={makeSlides()} autoPlayInterval={1000} />);

      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 3 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 4 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("pauses on hover and resumes on pointer-leave", () => {
      vi.useFakeTimers();
      const { container } = render(<Carousel slides={makeSlides()} autoPlayInterval={1000} />);
      const carousel = container.firstElementChild as HTMLElement;

      fireEvent.mouseEnter(carousel);
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      fireEvent.mouseLeave(carousel);
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("pauses on focus and resumes on blur", () => {
      vi.useFakeTimers();
      const { container } = render(<Carousel slides={makeSlides()} autoPlayInterval={1000} />);
      const carousel = container.firstElementChild as HTMLElement;

      fireEvent.focus(carousel);
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      fireEvent.blur(carousel);
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("pauses during an active touch and resumes after the touch ends", () => {
      vi.useFakeTimers();
      const { container } = render(<Carousel slides={makeSlides()} autoPlayInterval={1000} />);
      const carousel = container.firstElementChild as HTMLElement;

      fireEvent.touchStart(carousel, { touches: [{ clientX: 0 }] });
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 0 }] });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("does not auto-slide under prefers-reduced-motion, but manual controls still work", () => {
      mockMatchMedia(true);
      vi.useFakeTimers();
      render(<Carousel slides={makeSlides()} autoPlayInterval={1000} />);

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    // TASK B2c: Featured Products is content a user must be able to read
    // through before it moves (WCAG 2.2.2 Pause, Stop, Hide — and it is a grid
    // of cards, not a transient promo). autoSlide defaults to true so every
    // existing carousel keeps behaving exactly as before.
    it("never auto-advances when autoSlide is false, but manual controls still work", () => {
      vi.useFakeTimers();
      render(<Carousel slides={makeSlides()} autoPlayInterval={1000} autoSlide={false} />);

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      act(() => vi.advanceTimersByTime(10000));
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });
  });

  describe("controls", () => {
    it("swipes left/right on touch", () => {
      const { container } = render(<Carousel slides={makeSlides()} />);
      const carousel = container.firstElementChild as HTMLElement;

      fireEvent.touchStart(carousel, { touches: [{ clientX: 120 }] });
      fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 20 }] });
      expect(screen.getByRole("button", { name: "Slide 2 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      fireEvent.touchStart(carousel, { touches: [{ clientX: 20 }] });
      fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 120 }] });
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("loops forward (Next on last → first) and backward (Prev on first → last)", async () => {
      const user = userEvent.setup();
      render(<Carousel slides={makeSlides()} />);

      const nextBtn = screen.getByRole("button", { name: "Next slide" });
      const prevBtn = screen.getByRole("button", { name: "Previous slide" });

      await user.click(nextBtn);
      await user.click(nextBtn);
      await user.click(nextBtn);
      expect(screen.getByRole("button", { name: "Slide 4 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      await user.click(nextBtn);
      expect(screen.getByRole("button", { name: "Slide 1 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      await user.click(prevBtn);
      expect(screen.getByRole("button", { name: "Slide 4 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("dots are keyboard-operable (Enter/Space) and each announces 'Slide N of M'", async () => {
      const user = userEvent.setup();
      render(<Carousel slides={makeSlides()} />);

      for (const n of ["1", "2", "3", "4"]) {
        const dot = screen.getByRole("button", { name: `Slide ${n} of 4` });
        if (n === "1") {
          expect(dot).toHaveAttribute("aria-current", "true");
        } else {
          expect(dot).not.toHaveAttribute("aria-current");
        }
      }

      const dot3 = screen.getByRole("button", { name: "Slide 3 of 4" });
      dot3.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: "Slide 3 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );

      const dot4 = screen.getByRole("button", { name: "Slide 4 of 4" });
      dot4.focus();
      await user.keyboard(" ");
      expect(screen.getByRole("button", { name: "Slide 4 of 4" })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });
  });

  describe("click behavior", () => {
    it("opens a lightbox instead of navigating when enableLightbox is true", async () => {
      const user = userEvent.setup();
      const onSlideClick = vi.fn();
      render(<Carousel slides={makeSlides()} enableLightbox onSlideClick={onSlideClick} />);

      await user.click(screen.getByText("Slide 0"));

      expect(onSlideClick).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Enlarged image" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Close modal" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("fires the navigation callback and no lightbox when enableLightbox is false", async () => {
      const user = userEvent.setup();
      const slide = makeSlides(1)[0];
      const onSlideClick = vi.fn();
      render(<Carousel slides={[slide]} onSlideClick={onSlideClick} />);

      await user.click(screen.getByText("Slide 0"));

      expect(onSlideClick).toHaveBeenCalledTimes(1);
      expect(onSlideClick).toHaveBeenCalledWith(slide);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("nested interactive content", () => {
    it("nested interactive clicks fire only their own handler, not the outer slide handler", async () => {
      const user = userEvent.setup();
      const nestedClick = vi.fn();
      const onSlideClick = vi.fn();
      const slide = {
        id: 1,
        content: (
          <button type="button" onClick={nestedClick}>
            Nested CTA
          </button>
        ),
      };
      render(<Carousel slides={[slide]} onSlideClick={onSlideClick} />);

      await user.click(screen.getByRole("button", { name: "Nested CTA" }));

      expect(nestedClick).toHaveBeenCalledTimes(1);
      // ClickableArea's nested-interactive guard (INTERACTIVE_SELECTOR) skips
      // onActivate for clicks owned by a nested interactive element.
      expect(onSlideClick).not.toHaveBeenCalled();
    });
  });

  // ─── slide href (TASK B2c) ────────────────────────────────────────────────

  describe("slide href", () => {
    it("renders the active slide as a real link when the slide carries an href", () => {
      render(
        <Carousel
          slides={[
            { id: 1, content: <span>Slide 1</span>, href: "/shop/category/laptops" },
          ]}
          onSlideClick={vi.fn()}
        />,
      );

      expect(screen.getByRole("link")).toHaveAttribute("href", "/shop/category/laptops");
    });

    it("still reports the destination through onSlideClick so an SPA router can intercept the click", async () => {
      const user = userEvent.setup();
      const onSlideClick = vi.fn();
      const slide = {
        id: 1,
        content: <span>Slide 1</span>,
        href: "/shop/category/laptops",
      };
      render(<Carousel slides={[slide]} onSlideClick={onSlideClick} />);

      await user.click(screen.getByRole("link"));

      expect(onSlideClick).toHaveBeenCalledWith(slide);
    });

    it("keeps href=\"#\" for slides without an href", () => {
      render(<Carousel slides={makeSlides(1)} onSlideClick={vi.fn()} />);

      expect(screen.getByRole("link")).toHaveAttribute("href", "#");
    });

    it("does not wrap the active slide in a link when there is no slide click handler", () => {
      // The Featured carousel renders ProductCards, which are themselves links.
      // Wrapping them in a second anchor would nest anchors (invalid HTML).
      render(
        <Carousel
          slides={[
            {
              id: 1,
              content: <a href="/product/xps-15">Dell XPS 15</a>,
              href: "/shop/category/laptops",
            },
          ]}
        />,
      );

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", "/product/xps-15");
    });
  });
});