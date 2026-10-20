import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Badge } from "./index";

/** Each variant must map onto a design token, never an ad hoc colour. */
const variantTokens = {
  default: ["bg-[var(--color-surface-muted)]", "text-[var(--color-text-secondary)]"],
  success: [
    "bg-[var(--color-status-success)]/10",
    "text-[var(--color-status-success)]",
  ],
  warning: [
    "bg-[var(--color-status-warning)]/10",
    "text-[var(--color-status-warning)]",
  ],
  error: ["bg-[var(--color-status-error)]/10", "text-[var(--color-status-error)]"],
  info: ["bg-[var(--color-status-info)]/10", "text-[var(--color-status-info)]"],
} as const;

describe("Badge", () => {
  it("defaults to the default variant", () => {
    render(<Badge>Draft</Badge>);

    const badge = screen.getByText("Draft");
    for (const token of variantTokens.default) {
      expect(badge.className).toContain(token);
    }
  });

  it.each(["default", "success", "warning", "error", "info"] as const)(
    "renders the %s variant from design tokens",
    (variant) => {
      render(<Badge variant={variant}>Status</Badge>);

      const badge = screen.getByText("Status");
      for (const token of variantTokens[variant]) {
        expect(badge.className).toContain(token);
      }
    }
  );

  it.each(["default", "success", "warning", "error", "info"] as const)(
    "gives the %s variant a distinct background token",
    (variant) => {
      render(<Badge variant={variant}>Status</Badge>);

      expect(screen.getByText("Status").className).toContain("var(--color-");
    }
  );

  it("uses no raw hex or rgb colour for any variant", () => {
    for (const variant of ["default", "success", "warning", "error", "info"] as const) {
      const { container, unmount } = render(
        <Badge variant={variant}>Status</Badge>
      );

      expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(container.innerHTML).not.toMatch(/rgb\(/i);
      unmount();
    }
  });

  it("renders its children as the accessible text", () => {
    render(<Badge variant="success">Order confirmed</Badge>);

    const badge = screen.getByText("Order confirmed");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Order confirmed");
  });

  it("does not hide the status text from assistive technology", () => {
    render(<Badge variant="error">Payment failed</Badge>);

    const badge = screen.getByText("Payment failed");
    expect(badge).not.toHaveAttribute("aria-hidden");
    expect(badge).not.toHaveAttribute("role", "presentation");
  });

  it("renders a numeric count alongside a label", () => {
    render(<Badge variant="info">3</Badge>);

    expect(screen.getByText("3")).toHaveTextContent("3");
  });

  it("renders as a span element", () => {
    render(<Badge>Draft</Badge>);

    expect(screen.getByText("Draft").tagName).toBe("SPAN");
  });

  it("keeps the base badge shape in every variant", () => {
    render(
      <>
        <Badge variant="default">A</Badge>
        <Badge variant="error">B</Badge>
      </>
    );

    for (const text of ["A", "B"]) {
      const badge = screen.getByText(text);
      expect(badge.className).toContain("inline-flex");
      expect(badge.className).toContain("rounded-full");
      expect(badge.className).toContain("text-xs");
    }
  });

  it("merges a caller supplied className", () => {
    render(<Badge className="uppercase">New</Badge>);

    const badge = screen.getByText("New");
    expect(badge.className).toContain("uppercase");
    expect(badge.className).toContain("rounded-full");
  });

  it("forwards a ref to the underlying span", () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>In stock</Badge>);

    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current).toBe(screen.getByText("In stock"));
  });

  it("spreads additional span attributes such as title and data-testid", () => {
    render(
      <Badge title="Payment failed" data-testid="order-status">
        Failed
      </Badge>
    );

    const badge = screen.getByTestId("order-status");
    expect(badge).toHaveAttribute("title", "Payment failed");
    expect(badge).toHaveTextContent("Failed");
  });

  it("applies a caller className last so it can override the variant", () => {
    render(<Badge variant="error" className="bg-black">Failed</Badge>);

    const badge = screen.getByText("Failed");
    expect(badge.className).toContain("bg-black");
    expect(badge.className).toContain("text-[var(--color-status-error)]");
  });
});
