import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { isNotFoundError } from "./is-not-found";

describe("isNotFoundError", () => {
  it("is true for a 404 axios error", () => {
    const error = new AxiosError("request failed", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 404,
    } as never);

    expect(isNotFoundError(error)).toBe(true);
  });

  it("is false for a 500 axios error", () => {
    const error = new AxiosError("request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 500,
    } as never);

    expect(isNotFoundError(error)).toBe(false);
  });

  it("is false for a plain Error", () => {
    expect(isNotFoundError(new Error("boom"))).toBe(false);
  });

  it("is false for undefined", () => {
    expect(isNotFoundError(undefined)).toBe(false);
  });
});