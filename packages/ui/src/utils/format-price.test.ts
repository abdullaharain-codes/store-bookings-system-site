import { describe, expect, it } from "vitest";
import { formatPrice } from "./format-price";

describe("formatPrice", () => {
  it("formats a whole-number price with thousands grouping", () => {
    expect(formatPrice("150000")).toBe("Rs. 150,000");
    expect(formatPrice("1200")).toBe("Rs. 1,200");
    expect(formatPrice("900000.00")).toBe("Rs. 900,000");
  });

  it("keeps two decimal places when there are paise", () => {
    expect(formatPrice("1200.50")).toBe("Rs. 1,200.50");
    expect(formatPrice("128500.50")).toBe("Rs. 128,500.50");
  });
});