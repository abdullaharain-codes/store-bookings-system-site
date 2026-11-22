import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./index";

describe("Button", () => {
  it("defaults to the primary variant", () => {
    render(<Button>Submit</Button>);

    const button = screen.getByRole("button", { name: "Submit" });

    expect(button.className).toContain("bg-[var(--color-brand-accent)]");
  });

  it("renders the accent variant with the accent-cta fill and hover treatment", () => {
    render(<Button variant="accent">Book Service</Button>);

    const button = screen.getByRole("button", { name: "Book Service" });

    expect(button.className).toContain("bg-[var(--color-accent-cta)]");
    expect(button.className).toContain("text-white");
    expect(button.className).toContain("hover:bg-[var(--color-accent-cta)]/90");
  });

  it("renders the danger variant with destructive styling, focus-visible ring, and disabled treatment", () => {
    render(
      <Button variant="danger" disabled>
        Delete
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Delete" });

    expect(button.className).toContain("bg-[var(--color-status-error)]");
    expect(button.className).toContain("text-white");
    expect(button.className).toContain("focus-visible:ring-[var(--color-status-error)]");
    expect(button.className).toContain("disabled:pointer-events-none");
    expect(button.className).toContain("disabled:opacity-50");
    expect(button).toBeDisabled();
  });
});