import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./index";

describe("Card", () => {
  it("renders content with no hover-related classes by default", () => {
    const { container } = render(<Card>content</Card>);

    const card = container.firstElementChild as HTMLElement;
    expect(card.textContent).toBe("content");
    expect(card.className).toContain("shadow-[var(--shadow-1)]");
    expect(card.className).not.toContain("hover:shadow-");
    expect(card.className).not.toContain("hover:-translate-y-0.5");
    expect(card.className).not.toContain("transition-[box-shadow,transform]");
  });

  it("adds the interactive hover treatment when interactive is true", () => {
    const { container } = render(<Card interactive>content</Card>);

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("hover:shadow-[var(--shadow-hover)]");
    expect(card.className).toContain("hover:-translate-y-0.5");
    expect(card.className).toContain("transition-[box-shadow,transform]");
    expect(card.className).toContain("duration-[var(--motion-duration-fast)]");
  });
});