import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/utils";
import SiteLayout from "./site-layout";

/**
 * The shell owns the page's structural landmarks. Each test renders it
 * standalone, so anything that is wrong here shows up as a count or an order
 * failure rather than a vague visual regression.
 */
describe("site layout", () => {
  it("renders exactly one main landmark, focusable programmatically", () => {
    renderWithProviders(<SiteLayout />);

    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute("id", "main-content");
    expect(mains[0]).toHaveAttribute("tabindex", "-1");
  });

  it("orders header, main and footer in the document", () => {
    const { container } = renderWithProviders(<SiteLayout />);

    const header = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");

    /* eslint-disable no-bitwise */
    expect(
      header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    /* eslint-enable no-bitwise */
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("leaves horizontal padding to the routes, not the shell", () => {
    renderWithProviders(<SiteLayout />);

    const main = screen.getByRole("main");
    const classes = main.getAttribute("class") ?? "";

    expect(classes).not.toMatch(/\bpx-/);
    expect(classes).not.toMatch(/max-w-/);
  });

  it("stretches main so short pages still push the footer to the bottom", () => {
    const { container } = renderWithProviders(<SiteLayout />);

    expect(container.firstElementChild?.className).toMatch(/flex-col/);
    expect(screen.getByRole("main").className).toMatch(/flex-1/);
  });

  /**
   * `position: sticky` only travels inside its parent's box, so a sticky bar
   * nested in a header-sized wrapper is pinned for roughly its own height and
   * then scrolls away. jsdom has no layout or scrolling, so this cannot be
   * verified by simulating a scroll; the two things that actually make it work
   * are asserted structurally instead — the class, and a parent that spans the
   * whole page.
   */
  it("pins the header bar to the full-height layout root", () => {
    const { container } = renderWithProviders(<SiteLayout />);

    const header = screen.getByRole("banner");
    expect(header.className).toMatch(/\bsticky\b/);
    expect(header.className).toMatch(/\btop-0\b/);
    expect(header.parentElement).toBe(container.firstElementChild);
  });

  it("still exposes exactly one banner landmark", () => {
    renderWithProviders(<SiteLayout />);

    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("puts the announcement strip above the sticky header", () => {
    const { container } = renderWithProviders(<SiteLayout />);

    const announcement = screen.getByTestId("site-announcement");
    const header = screen.getByRole("banner");

    expect(announcement).toHaveTextContent(/cash on delivery available nationwide/i);
    /* eslint-disable no-bitwise */
    expect(
      announcement.compareDocumentPosition(header) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    /* eslint-enable no-bitwise */
    // A sibling of the header, not a descendant: nesting it would cap the
    // sticky travel at the height of the header.
    expect(header.contains(announcement)).toBe(false);
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });
});
