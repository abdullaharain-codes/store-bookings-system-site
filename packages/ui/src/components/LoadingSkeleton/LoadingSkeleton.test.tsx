import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingSkeleton } from "./index";

describe("LoadingSkeleton", () => {
  it("renders the configured number of items and text lines", () => {
    const { container } = render(<LoadingSkeleton items={2} lines={4} />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2 * (1 + 4));
  });

  it("uses the default 1 item and 3 lines when no counts are provided", () => {
    const { container } = render(<LoadingSkeleton />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(1 + 3);
  });

  it("marks the visual skeleton bars as hidden from assistive tech", () => {
    const { container } = render(<LoadingSkeleton />);

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it("announces a status role with the given label when provided", () => {
    render(<LoadingSkeleton label="Loading products" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Loading products");
  });
});