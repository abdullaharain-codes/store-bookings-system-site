import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet },
}));

import { getShippingFee } from "./shipping-fee";

describe("shipping-fee", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("getShippingFee calls /shipping-fee and returns the money-string field", async () => {
    mockGet.mockResolvedValue({ data: { shipping_fee: "200.00" } });

    const result = await getShippingFee();

    expect(mockGet).toHaveBeenCalledWith("/shipping-fee");
    expect(result).toEqual({ shipping_fee: "200.00" });
    expect(result.shipping_fee).toBe("200.00");
  });

  it("keeps the fee as the server's 2-decimal string, not a coerced number", async () => {
    mockGet.mockResolvedValue({ data: { shipping_fee: "500.00" } });

    const { shipping_fee } = await getShippingFee();

    // A number would lose the trailing ".00" and re-introduce float rounding.
    expect(typeof shipping_fee).toBe("string");
    expect(shipping_fee).toBe("500.00");
  });

  it("propagates an API error to the caller", async () => {
    mockGet.mockRejectedValue(new Error("Network Error"));

    await expect(getShippingFee()).rejects.toThrow("Network Error");
  });
});
