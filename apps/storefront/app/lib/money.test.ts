import { describe, expect, it } from "vitest";
import { multiplyMoney, sumMoney } from "./money";

/**
 * The cart computes its displayed line totals and subtotal from 2-decimal money
 * strings. Doing that with floats reintroduces the 0.1 + 0.2 problem, so these
 * functions work in integer minor units and are proven against the same cases
 * a naive `Number(a) + Number(b)` would get wrong.
 */
describe("multiplyMoney", () => {
  it("returns the price unchanged for quantity 1", () => {
    expect(multiplyMoney("450000.00", 1)).toBe("450000.00");
  });

  it("multiplies without floating error", () => {
    expect(multiplyMoney("149.99", 3)).toBe("449.97");
    expect(multiplyMoney("0.10", 3)).toBe("0.30");
  });

  it("handles large values exactly", () => {
    expect(multiplyMoney("99999.99", 5)).toBe("499999.95");
  });

  it("handles a whole-number price", () => {
    expect(multiplyMoney("200", 2)).toBe("400.00");
  });

  it("throws on an invalid money string", () => {
    expect(() => multiplyMoney("abc", 1)).toThrow(/Invalid money value/);
    expect(() => multiplyMoney("", 1)).toThrow(/Invalid money value/);
    expect(() => multiplyMoney("-5.00", 1)).toThrow(/Invalid money value/);
    expect(() => multiplyMoney("1.999", 1)).toThrow(/Invalid money value/);
  });

  it("throws on an invalid quantity", () => {
    expect(() => multiplyMoney("10.00", -1)).toThrow(/Invalid quantity/);
    expect(() => multiplyMoney("10.00", 1.5)).toThrow(/Invalid quantity/);
  });
});

describe("sumMoney", () => {
  it("avoids the 0.1 + 0.2 float trap", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
  });

  it("sums many values exactly", () => {
    expect(sumMoney(["450000.00", "320000.00", "0.99"])).toBe("770000.99");
  });

  it("passes thousands without a separator", () => {
    expect(sumMoney(["1000.00", "2000.00"])).toBe("3000.00");
  });

  it("returns 0.00 for an empty list", () => {
    expect(sumMoney([])).toBe("0.00");
  });

  it("throws when an element is invalid", () => {
    expect(() => sumMoney(["1.00", "nope"])).toThrow(/Invalid money value/);
  });
});
