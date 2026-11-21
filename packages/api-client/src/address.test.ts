import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("./api-client", () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}));

import {
  createAddress,
  deleteAddress,
  getAddresses,
  setDefaultAddress,
  updateAddress,
} from "./address";
import type {
  Address,
  CreateAddressData,
  UpdateAddressData,
} from "./address";

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
    mockPut.mockReset();
    mockDelete.mockReset();
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

  // ─── updateAddress ──────────────────────────────────────────────────────

  it("updateAddress PUTs the body to /addresses/{id} exactly as given", async () => {
    mockPut.mockResolvedValue({ data: { address } });
    const changes: UpdateAddressData = {
      recipient_name: "Ada Byron",
      city: "Karachi",
    };

    const result = await updateAddress(4, changes);

    expect(mockPut).toHaveBeenCalledWith("/addresses/4", {
      recipient_name: "Ada Byron",
      city: "Karachi",
    });
    expect(result).toEqual({ address });
  });

  it("updateAddress never adds is_default when the caller omits it", async () => {
    mockPut.mockResolvedValue({ data: { address } });

    await updateAddress(4, { label: "Office" });

    const body = mockPut.mock.calls[0][1] as Record<string, unknown>;
    // The body must be forwarded verbatim, and in particular must NOT gain an
    // is_default key the caller never supplied (set-default has its own route).
    expect(body).toEqual({ label: "Office" });
    expect("is_default" in body).toBe(false);
  });

  it("UpdateAddressData has no is_default field (type guard)", () => {
    // @ts-expect-error is_default is intentionally not updatable here
    const invalid: UpdateAddressData = { is_default: true };
    expect(invalid).toEqual({ is_default: true });
  });

  it("updateAddress propagates an error", async () => {
    mockPut.mockRejectedValue(new Error("network down"));

    await expect(updateAddress(4, { city: "Karachi" })).rejects.toThrow(
      "network down",
    );
  });

  // ─── deleteAddress ──────────────────────────────────────────────────────

  it("deleteAddress DELETEs /addresses/{id} and returns the message envelope", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Address deleted." } });

    const result = await deleteAddress(4);

    expect(mockDelete).toHaveBeenCalledWith("/addresses/4");
    expect(result).toEqual({ message: "Address deleted." });
  });

  it("deleteAddress propagates an error", async () => {
    mockDelete.mockRejectedValue(new Error("network down"));

    await expect(deleteAddress(4)).rejects.toThrow("network down");
  });

  // ─── setDefaultAddress ──────────────────────────────────────────────────

  it("setDefaultAddress POSTs /addresses/{id}/default with no body", async () => {
    mockPost.mockResolvedValue({ data: { message: "Default address set." } });

    const result = await setDefaultAddress(4);

    expect(mockPost).toHaveBeenCalledWith("/addresses/4/default");
    expect(result).toEqual({ message: "Default address set." });
  });

  it("setDefaultAddress propagates an error", async () => {
    mockPost.mockRejectedValue(new Error("network down"));

    await expect(setDefaultAddress(4)).rejects.toThrow("network down");
  });
});
