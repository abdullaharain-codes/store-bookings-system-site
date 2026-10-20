import { describe, expect, it } from "vitest";
import { formatPriceRange } from "./format-price-range";

describe("formatPriceRange", () => {
  it("formats both bounds with an en dash between them", () => {
    expect(formatPriceRange("2500", "8000")).toBe("Rs. 2,500 – Rs. 8,000");
  });

  it("keeps both bounds even when they are equal, never a single bare price", () => {
    expect(formatPriceRange("5000", "5000")).toBe("Rs. 5,000 – Rs. 5,000");
  });
});
