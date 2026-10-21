/**
 * Unit tests for the shared axios-error parsing helpers (TASK B4-2a, 0.3).
 *
 * These extract the parsing that used to exist twice (apiErrorDetail in
 * useAddToCart, cartErrorMessage in CartView) into one module, so the
 * "409/422 shows the server's own message, everything else collapses to a
 * generic line" rule cannot drift between call sites.
 */
import { describe, expect, it } from "vitest";
import {
  getApiErrorStatus,
  getApiErrorMessage,
  getApiFieldErrors,
  userMessageFor,
} from "./api-error";

function axiosLike(response: Record<string, unknown>): unknown {
  return { response };
}

describe("getApiErrorStatus", () => {
  it("returns the numeric HTTP status when present", () => {
    expect(getApiErrorStatus(axiosLike({ status: 422 }))).toBe(422);
    expect(getApiErrorStatus(axiosLike({ status: 409 }))).toBe(409);
    expect(getApiErrorStatus(axiosLike({ status: 500 }))).toBe(500);
  });

  it("returns 0 for a non-numeric status, a missing response, or a non-object", () => {
    expect(getApiErrorStatus(axiosLike({ status: "422" }))).toBe(0);
    expect(getApiErrorStatus({})).toBe(0);
    expect(getApiErrorStatus(null)).toBe(0);
    expect(getApiErrorStatus(undefined)).toBe(0);
    expect(getApiErrorStatus("boom")).toBe(0);
    expect(getApiErrorStatus(new Error("boom"))).toBe(0);
  });
});

describe("getApiErrorMessage", () => {
  it("returns the top-level message string when present", () => {
    expect(
      getApiErrorMessage(axiosLike({ status: 422, data: { message: "Only 1 left in stock." } }))
    ).toBe("Only 1 left in stock.");
  });

  it('returns "" when the message is absent, empty, or not a string', () => {
    expect(getApiErrorMessage(axiosLike({ status: 500, data: {} }))).toBe("");
    expect(getApiErrorMessage(axiosLike({ status: 500 }))).toBe("");
    expect(
      getApiErrorMessage(axiosLike({ status: 500, data: { message: 42 } }))
    ).toBe("");
    expect(getApiErrorMessage(new Error("boom"))).toBe("");
  });

  it("does NOT dig into the 422 errors bag — that is getApiFieldErrors' job", () => {
    expect(
      getApiErrorMessage(
        axiosLike({ status: 422, data: { errors: { phone: ["bad"] } } })
      )
    ).toBe("");
  });
});

describe("getApiFieldErrors", () => {
  it("returns the 422 errors bag keyed by field", () => {
    expect(
      getApiFieldErrors(
        axiosLike({
          status: 422,
          data: { message: "The given data was invalid.", errors: { phone: ["The phone field is required."], city: ["required"] } },
        })
      )
    ).toEqual({ phone: ["The phone field is required."], city: ["required"] });
  });

  it("returns {} when the bag is absent or not an object of arrays", () => {
    expect(getApiFieldErrors(axiosLike({ status: 422, data: { message: "x" } }))).toEqual({});
    expect(getApiFieldErrors(axiosLike({ status: 500, data: { errors: "nope" } }))).toEqual({});
    expect(getApiFieldErrors(new Error("boom"))).toEqual({});
    expect(
      getApiFieldErrors(
        axiosLike({ status: 422, data: { errors: { phone: "not-an-array" } } })
      )
    ).toEqual({});
  });
});

describe("userMessageFor", () => {
  it("returns the server's top-level message on 409 and 422", () => {
    expect(
      userMessageFor(axiosLike({ status: 422, data: { message: "Only 1 left in stock." } }), "generic")
    ).toBe("Only 1 left in stock.");
    expect(
      userMessageFor(axiosLike({ status: 409, data: { message: "Stock conflict." } }), "generic")
    ).toBe("Stock conflict.");
  });

  it("returns the fallback for every other status, even with a message present", () => {
    expect(
      userMessageFor(axiosLike({ status: 500, data: { message: "SQLSTATE leak" } }), "generic")
    ).toBe("generic");
    expect(
      userMessageFor(axiosLike({ status: 401, data: { message: "Unauthenticated." } }), "generic")
    ).toBe("generic");
    expect(userMessageFor(axiosLike({ status: 422, data: {} }), "generic")).toBe("generic");
    expect(userMessageFor(new Error("boom"), "generic")).toBe("generic");
  });
});
