import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceTag } from "./index";

describe("PriceTag", () => {
  it("renders the selling price only when there is no discount", () => {
    render(<PriceTag price="150000" compareAtPrice={null} discountPercent={null} />);

    expect(screen.getByText("Rs. 150,000")).toBeInTheDocument();
    expect(screen.queryByText("Original price:")).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
  });

  it("renders the struck compare-at and -N% badge when discounted", () => {
    render(<PriceTag price="150000" compareAtPrice="200000" discountPercent={25} />);

    expect(screen.getByText("Rs. 150,000")).toBeInTheDocument();
    expect(screen.getByText("-25%")).toBeInTheDocument();
    const original = screen.getByText(/Rs\. 200,000$/);
    expect(original).toHaveClass("line-through");
    expect(screen.getByText("Original price:")).toBeInTheDocument();
  });

  it("renders no discount UI when compare-at is present but the server computed no discount", () => {
    render(<PriceTag price="200000" compareAtPrice="200000" discountPercent={null} />);

    expect(screen.queryByText("Original price:")).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
  });
});
