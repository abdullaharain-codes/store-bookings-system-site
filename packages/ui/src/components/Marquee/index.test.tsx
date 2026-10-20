import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Marquee } from "./index";

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

/**
 * Marquee items are links because that is what the real callers pass
 * (BrandCard / CategoryCard both wrap content in a ClickableArea anchor). Using
 * links also lets role-based queries prove the decoration copy is unreachable
 * from the accessibility tree, which text queries cannot do.
 */
function makeItems(count = 3) {
  return Array.from({ length: count }, (_, i) => (
    <a key={i} href={`/brand/${i}`}>
      {`Brand ${i}`}
    </a>
  ));
}

function getRegion(name = "Featured brands") {
  return screen.getByRole("region", { name });
}

function getTrack() {
  return document.querySelector("[data-marquee-track]") as HTMLElement;
}

function getDecorationCopies() {
  return document.querySelectorAll('[data-marquee-copy="decorative"]');
}

function getPrimaryCopy() {
  return document.querySelector('[data-marquee-copy="primary"]') as HTMLElement;
}

/**
 * LOOP-GEOMETRY TESTS — structural guards only.
 *
 * jsdom has no layout engine: it never computes widths, so nothing here can
 * prove the loop is actually seamless or that the band fills the viewport.
 * These assertions lock the CLASS STRUCTURE that the arithmetic in
 * styles/marquee.css depends on — if the track ever regains a gap, or the two
 * copies drift apart in spacing, the g/2 seam bug comes straight back and only
 * a real browser would show it. Pixel-level verification of the seam is a D4
 * Playwright item, not something to fake here.
 */
describe("Marquee loop geometry (structural guards — jsdom has no layout)", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it("puts no gap on the track, so the only spacing comes from the copies", () => {
    render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);

    const trackClasses = getTrack().className.split(/\s+/);
    const gapUtilities = trackClasses.filter((token) => token.startsWith("gap-"));

    expect(gapUtilities).toEqual([]);
  });

  it("gives both copies identical spacing classes so one period is one copy width", () => {
    render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);

    const primary = getPrimaryCopy().className;
    const decorative = getDecorationCopies()[0].className;

    // Both copies must be spaced identically: any asymmetry here is a seam.
    expect(primary).toBe(decorative);
  });

  it("carries each copy's trailing spacing as padding, not as a track gap", () => {
    render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);

    for (const copy of [getPrimaryCopy(), getDecorationCopies()[0] as HTMLElement]) {
      // Trailing spacing lives inside the copy's own width (padding-right),
      // so the copy's width already includes it.
      expect(copy.className).toContain("pr-[var(--space-6)]");
      expect(copy.className).toContain("gap-[var(--space-6)]");
    }
  });

  it("stretches a short list to at least two container widths", () => {
    render(<Marquee ariaLabel="Featured brands">{makeItems(2)}</Marquee>);

    // Track is at least 2x the clipped container; each copy therefore at least
    // 1x, so items never leave blank space on the right.
    expect(getTrack().className).toContain("min-w-[200%]");

    for (const copy of [getPrimaryCopy(), getDecorationCopies()[0] as HTMLElement]) {
      expect(copy.className).toContain("grow");
      expect(copy.className).toContain("shrink-0");
      expect(copy.className).toContain("justify-around");
    }
  });

  it("keeps the decoration copy aria-hidden and inert through the layout change", () => {
    render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);

    const decorative = getDecorationCopies()[0];
    expect(decorative).toHaveAttribute("aria-hidden", "true");
    expect(decorative).toHaveAttribute("inert");
  });
});

describe("Marquee", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  describe("accessible content vs. decoration copy", () => {
    it("exposes every child once and adds one aria-hidden + inert decoration copy", () => {
      const { container } = render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);

      // Each item is reachable exactly once — role queries ignore aria-hidden
      // subtrees, so a second copy would make these throw on getByRole.
      for (const name of ["Brand 0", "Brand 1", "Brand 2"]) {
        expect(screen.getByRole("link", { name })).toBeInTheDocument();
      }

      expect(container.querySelectorAll('a[href="/brand/0"]')).toHaveLength(2);

      const copies = getDecorationCopies();
      expect(copies).toHaveLength(1);
      expect(copies[0]).toHaveAttribute("aria-hidden", "true");
      expect(copies[0]).toHaveAttribute("inert");
      expect(within(copies[0] as HTMLElement).queryByRole("link", { name: "Brand 0" })).toBeNull();
    });

    it("still renders and duplicates a single item", () => {
      render(<Marquee ariaLabel="Featured brands">{makeItems(1)}</Marquee>);

      expect(screen.getByRole("link", { name: "Brand 0" })).toBeInTheDocument();
      expect(getDecorationCopies()).toHaveLength(1);
    });
  });

  describe("prefers-reduced-motion", () => {
    it("renders a single copy, no pause button, and a focusable scroll strip", () => {
      mockMatchMedia(true);
      const { container } = render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);

      for (const name of ["Brand 0", "Brand 1", "Brand 2"]) {
        expect(screen.getByRole("link", { name })).toBeInTheDocument();
      }

      expect(container.querySelectorAll('a[href="/brand/0"]')).toHaveLength(1);
      expect(getDecorationCopies()).toHaveLength(0);
      expect(getTrack()).toBeNull();

      expect(
        screen.queryByRole("button", { name: "Pause scrolling" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Resume scrolling" })
      ).not.toBeInTheDocument();

      const region = getRegion();
      expect(region).toHaveAttribute("tabindex", "0");
      expect(region).toHaveAttribute("data-reduced-motion", "true");
      region.focus();
      expect(region).toHaveFocus();
    });
  });

  describe("pause state", () => {
    it("pauses on pointer-enter and resumes on pointer-leave", () => {
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      const region = getRegion();
      expect(region).toHaveAttribute("data-paused", "false");

      fireEvent.pointerEnter(region);
      expect(region).toHaveAttribute("data-paused", "true");

      fireEvent.pointerLeave(region);
      expect(region).toHaveAttribute("data-paused", "false");
    });

    it("pauses while focus is inside and resumes when focus leaves the region", () => {
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      const region = getRegion();
      const item = screen.getByRole("link", { name: "Brand 0" });

      fireEvent.focus(item, { relatedTarget: document.body });
      expect(region).toHaveAttribute("data-paused", "true");

      fireEvent.blur(item, { relatedTarget: document.body });
      expect(region).toHaveAttribute("data-paused", "false");
    });

    it("does not un-pause between focus moves from one item to the next", () => {
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      const region = getRegion();
      const first = screen.getByRole("link", { name: "Brand 0" });
      const second = screen.getByRole("link", { name: "Brand 1" });

      fireEvent.focus(first, { relatedTarget: document.body });
      expect(region).toHaveAttribute("data-paused", "true");

      fireEvent.blur(first, { relatedTarget: second });
      fireEvent.focus(second, { relatedTarget: first });

      expect(region).toHaveAttribute("data-paused", "true");
    });
  });

  describe("pause control", () => {
    it("toggles the label, aria-pressed and data-paused", async () => {
      const user = userEvent.setup();
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      const region = getRegion();

      const pause = screen.getByRole("button", { name: "Pause scrolling" });
      expect(pause).toHaveAttribute("aria-pressed", "false");
      expect(region).toHaveAttribute("data-paused", "false");

      await user.click(pause);

      const resume = screen.getByRole("button", { name: "Resume scrolling" });
      expect(resume).toHaveAttribute("aria-pressed", "true");
      expect(region).toHaveAttribute("data-paused", "true");

      await user.click(resume);

      expect(screen.getByRole("button", { name: "Pause scrolling" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      // The pointer is still over the band (userEvent.click really moves it), so
      // hover-pause legitimately holds. Resume clears the user-pause; only
      // pointer-leave can clear hover-pause.
      expect(region).toHaveAttribute("data-paused", "true");

      fireEvent.pointerLeave(region);
      expect(region).toHaveAttribute("data-paused", "false");
    });

    it("resumes via keyboard even while focus stays on the pause button", async () => {
      const user = userEvent.setup();
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      const region = getRegion();
      const pause = screen.getByRole("button", { name: "Pause scrolling" });

      await user.click(pause);
      expect(region).toHaveAttribute("data-paused", "true");

      // userEvent keeps the pointer over the button; unhover so the only thing
      // that could keep the band paused is focus on the button itself.
      fireEvent.pointerLeave(region);
      await user.click(screen.getByRole("button", { name: "Resume scrolling" }));

      // Focus is still on the button. If the button counted as "focus inside",
      // this would stay true and the band could never restart by keyboard.
      expect(pause).toHaveFocus();
      expect(region).toHaveAttribute("data-paused", "false");
    });

    it("stays paused after the pointer leaves, then honours the resume click", async () => {
      const user = userEvent.setup();
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      const region = getRegion();

      fireEvent.pointerEnter(region);
      await user.click(screen.getByRole("button", { name: "Pause scrolling" }));

      fireEvent.pointerLeave(region);
      expect(region).toHaveAttribute("data-paused", "true");
      expect(screen.getByRole("button", { name: "Resume scrolling" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      await user.click(screen.getByRole("button", { name: "Resume scrolling" }));
      expect(region).toHaveAttribute("data-paused", "false");
    });

    it("can be omitted with pauseControl={false}", () => {
      render(
        <Marquee ariaLabel="Featured brands" pauseControl={false}>
          {makeItems()}
        </Marquee>
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(getRegion()).toHaveAttribute("data-paused", "false");
    });
  });

  describe("direction and duration", () => {
    it("defaults to direction left", () => {
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      expect(getRegion()).toHaveAttribute("data-direction", "left");
    });

    it("reflects an explicit direction", () => {
      render(
        <Marquee ariaLabel="Featured brands" direction="right">
          {makeItems()}
        </Marquee>
      );
      expect(getRegion()).toHaveAttribute("data-direction", "right");
    });

    it("uses the 40s default duration", () => {
      render(<Marquee ariaLabel="Featured brands">{makeItems()}</Marquee>);
      expect(getTrack().style.animationDuration).toBe("40s");
    });

    it("clamps below 10s and above 120s", () => {
      const { unmount } = render(
        <Marquee ariaLabel="Featured brands" durationSeconds={3}>
          {makeItems()}
        </Marquee>
      );
      expect(getTrack().style.animationDuration).toBe("10s");
      unmount();

      render(
        <Marquee ariaLabel="Featured brands" durationSeconds={5000}>
          {makeItems()}
        </Marquee>
      );
      expect(getTrack().style.animationDuration).toBe("120s");
    });

    it("falls back to the default for non-finite durations", () => {
      render(
        <Marquee ariaLabel="Featured brands" durationSeconds={Number.NaN}>
          {makeItems()}
        </Marquee>
      );
      expect(getTrack().style.animationDuration).toBe("40s");
    });
  });

  describe("edge cases", () => {
    it("renders nothing when there are no children", () => {
      const { container } = render(<Marquee ariaLabel="Featured brands">{[]}</Marquee>);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing for null children", () => {
      const { container } = render(
        <Marquee ariaLabel="Featured brands">{null}</Marquee>
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("labels the region with ariaLabel", () => {
      render(<Marquee ariaLabel="Brands we stock">{makeItems(1)}</Marquee>);

      expect(getRegion("Brands we stock")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Featured brands" })).toBeNull();
    });
  });
});