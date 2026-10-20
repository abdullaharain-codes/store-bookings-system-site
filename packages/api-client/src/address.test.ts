import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("./api-client", () => ({
  default: { get: mockGet, post: mockPost },
}));

import { createAddress, getAddresses } from "./address";
import type { Address, CreateAddressData } from "./address";

const address: Address = {
  id: 4,
  user_id: 7,
  label: "Home",
  recipient_name: "Ada Lovelace",
  phone: "+923001234567",
  address_line_1: "12 Street 1",
  address_line_2: null,
  city: "Lahore",
  postal_code: "54000",
  is_default: true,
};

const payload: CreateAddressData = {
  recipient_name: "Ada Lovelace",
  phone: "+923001234567",
  address_line_1: "12 Street 1",
  city: "Lahore",
};

describe("address", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  // ─── getAddresses ──────────────────────────────────────────────────────────

  it("getAddresses calls /addresses with no config and unwraps the envelope", async () => {
    mockGet.mockResolvedValue({ data: { addresses: [address] } });

    const result = await getAddresses();

    expect(mockGet).toHaveBeenCalledWith("/addresses");
    expect(result).toEqual({ addresses: [address] });
  });

  it("getAddresses returns an empty list unchanged", async () => {
    mockGet.mockResolvedValue({ data: { addresses: [] } });

    const result = await getAddresses();

    expect(result).toEqual({ addresses: [] });
  });

  it("getAddresses propagates an error", async () => {
    mockGet.mockRejectedValue(new Error("network down"));

    await expect(getAddresses()).rejects.toThrow("network down");
  });

  // ─── createAddress ─────────────────────────────────────────────────────────

  it("createAddress posts the payload to /addresses and unwraps data.address", async () => {
    mockPost.mockResolvedValue({ data: { address } });

    const result = await createAddress(payload);

    expect(mockPost).toHaveBeenCalledWith("/addresses", payload);
    expect(result).toEqual({ address });
  });

  it("createAddress forwards the optional fields it is given", async () => {
    mockPost.mockResolvedValue({ data: { address } });

    const full: CreateAddressData = {
      ...payload,
      address_line_2: "Flat 3",
      postal_code: "54000",
      label: "Office",
      is_default: true,
    };

    await createAddress(full);

    expect(mockPost).toHaveBeenCalledWith("/addresses", {
      recipient_name: "Ada Lovelace",
      phone: "+923001234567",
      address_line_1: "12 Street 1",
      address_line_2: "Flat 3",
      city: "Lahore",
      postal_code: "54000",
      label: "Office",
      is_default: true,
    });
  });

  it("createAddress propagates an error", async () => {
    mockPost.mockRejectedValue(new Error("network down"));

    await expect(createAddress(payload)).rejects.toThrow("network down");
  });
});
