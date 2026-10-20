import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeading } from "./PageHeading";

describe("PageHeading", () => {
  it("renders an h1 with the shared page-heading class and its text", () => {
    const { container } = render(<PageHeading>Services</PageHeading>);

    const heading = container.querySelector("h1") as HTMLElement;
    expect(heading).not.toBeNull();
    expect(heading.textContent).toBe("Services");
    expect(heading.className).toContain("font-[family-name:var(--font-family-display)]");
    expect(heading.className).toContain("text-[var(--color-text-primary)]");
  });
});