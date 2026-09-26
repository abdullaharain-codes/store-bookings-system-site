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
});