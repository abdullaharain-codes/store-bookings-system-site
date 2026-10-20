import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("renders a sub-hour duration as minutes", () => {
    expect(formatDuration(45)).toBe("45 min");
  });

  it("renders 60 minutes as 1 hr with no trailing min", () => {
    expect(formatDuration(60)).toBe("1 hr");
  });

  it("renders 120 minutes as 2 hrs with plural hours and no trailing min", () => {
    expect(formatDuration(120)).toBe("2 hrs");
  });

  it("renders a mixed duration as hours and minutes", () => {
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });
});
