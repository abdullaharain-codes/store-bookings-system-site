import { describe, expect, it } from "vitest";
import { formatPlacedDate } from "./format-placed-date";

/**
 * The placed-date formatter renders an ISO timestamp in the BROWSER's locale
 * and timezone. These assertions stay locale-agnostic: they prove a valid date
 * formats to something non-empty and that the invalid/missing guards hold,
 * without pinning a specific zone (which would break on another machine).
 */
describe("formatPlacedDate", () => {
  it("formats a valid ISO timestamp to a non-empty string", () => {
    const formatted = formatPlacedDate("2026-10-20T14:30:00.000000Z");

    expect(formatted).toBeTruthy();
    expect(formatted).toContain("2026");
  });

  it("returns an empty string for a null/undefined timestamp", () => {
    expect(formatPlacedDate(null)).toBe("");
    expect(formatPlacedDate(undefined)).toBe("");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatPlacedDate("not-a-date")).toBe("");
  });
});
