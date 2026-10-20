import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClickableArea } from "./index";

describe("ClickableArea", () => {
  it("renders a plain div (not a link) when onActivate is omitted", () => {
    const { container } = render(
      <ClickableArea>
        <span>Some content</span>
      </ClickableArea>
    );

    expect(container.querySelector("a")).toBeNull();
    expect((container.firstElementChild as HTMLElement).tagName).toBe("DIV");
    expect(screen.getByText("Some content")).toBeInTheDocument();
  });

  it("renders as a clickable element and calls onActivate when clicked", () => {
    const onActivate = vi.fn();
    const { container } = render(
      <ClickableArea onActivate={onActivate}>
        <span>Some content</span>
      </ClickableArea>
    );

    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("#");

    fireEvent.click(link);

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("prevents default so clicking does not navigate", () => {
    const onActivate = vi.fn();
    const { container } = render(
      <ClickableArea onActivate={onActivate}>
        <span>Some content</span>
      </ClickableArea>
    );

    const link = container.querySelector("a") as HTMLAnchorElement;
    let defaultPrevented: boolean | undefined;
    container.addEventListener("click", (event) => {
      defaultPrevented = event.defaultPrevented;
    });

    fireEvent.click(link);

    expect(defaultPrevented).toBe(true);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  // ─── href / modified clicks (TASK B2c) ───────────────────────────────────

  it("behaves as a normal link when href is given without onActivate", () => {
    const { container } = render(
      <ClickableArea href="/shop/category/laptops">
        <span>Some content</span>
      </ClickableArea>
    );

    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/shop/category/laptops");

    // With no handler there is nothing to intercept: the default action must
    // survive, otherwise the href would be a lie and only middle-click would
    // ever work.
    let defaultPrevented: boolean | undefined;
    container.addEventListener("click", (event) => {
      defaultPrevented = event.defaultPrevented;
    });
    fireEvent.click(link);

    expect(defaultPrevented).toBe(false);
  });

  it("prevents the default action and calls onActivate when both href and onActivate are given", () => {
    const onActivate = vi.fn();
    const { container } = render(
      <ClickableArea href="/shop/category/laptops" onActivate={onActivate}>
        <span>Some content</span>
      </ClickableArea>
    );
    const link = container.querySelector("a") as HTMLAnchorElement;

    let defaultPrevented: boolean | undefined;
    container.addEventListener("click", (event) => {
      defaultPrevented = event.defaultPrevented;
    });
    fireEvent.click(link);

    expect(defaultPrevented).toBe(true);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("leaves modified clicks (ctrl, shift, alt, meta, non-primary) alone", () => {
    const onActivate = vi.fn();
    const { container } = render(
      <ClickableArea href="/shop/category/laptops" onActivate={onActivate}>
        <span>Some content</span>
      </ClickableArea>
    );
    const link = container.querySelector("a") as HTMLAnchorElement;

    let defaultPrevented: boolean | undefined;
    container.addEventListener("click", (event) => {
      defaultPrevented = event.defaultPrevented;
    });

    const modified: MouseEventInit[] = [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ];

    for (const init of modified) {
      defaultPrevented = undefined;
      fireEvent.click(link, init);
      // The whole reason a real href exists: ctrl/cmd-click (open in new tab),
      // middle-click and friends must reach the browser's own link handling and
      // never be swallowed by the router.
      expect(defaultPrevented).toBe(false);
    }

    expect(onActivate).not.toHaveBeenCalled();

    // ...and an ordinary left click still routes in-app.
    fireEvent.click(link);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});