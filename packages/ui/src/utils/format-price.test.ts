import { describe, expect, it } from "vitest";
import { formatPrice } from "./format-price";

describe("formatPrice", () => {
  it("formats a whole-number price with thousands grouping", () => {
    expect(formatPrice("150000")).toBe("Rs. 150,000");
  });

  it("rounds a fractional price to a whole number", () => {
    expect(formatPrice("128500.50")).toBe("Rs. 128,501");
  });
});