import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContainer } from "./PageContainer";

describe("PageContainer", () => {
  it("renders the single shared page wrapper div around its children", () => {
    const { container } = render(
      <PageContainer>
        <p>hello</p>
      </PageContainer>,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.className).toContain("max-w-[1280px]");
    expect(wrapper.className).toContain("pt-[var(--space-7)]");
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});