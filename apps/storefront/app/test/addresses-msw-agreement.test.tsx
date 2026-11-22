import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAddress,
  deleteAddress,
  getAddresses,
  setDefaultAddress,
  updateAddress,
  useAuthStore,
} from "@ecommerce/api-client";
import { callCounts, session } from "./handlers";
import { resetAddressesSource } from "./handlers-addresses";
import { recordedRequests } from "./server";

const testUser = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 2, name: "Customer", slug: "customer" },
};

describe("addresses MSW agreement (STEP 0 contract)", () => {
  beforeEach(() => {
    resetAddressesSource();
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
  });

  afterEach(() => {
    session.end();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isSessionChecked: false,
    });
  });

  it("GET /addresses returns { addresses: Address[] }", async () => {
    const result = await getAddresses();

    expect(callCounts.addresses).toBe(1);
    expect(result).toHaveProperty("addresses");
    expect(Array.isArray(result.addresses)).toBe(true);
    expect(result.addresses.length).toBeGreaterThan(0);
    expect(result.addresses[0]).toMatchObject({
      id: expect.any(Number),
      recipient_name: expect.any(String),
      phone: expect.any(String),
      address_line_1: expect.any(String),
      city: expect.any(String),
    });
    expect(recordedRequests).toContain("GET /api/v1/addresses");
  });

  it("POST /addresses returns 201 { address } and does not send is_default from forms", async () => {
    const body = {
      recipient_name: "New Person",
      phone: "03000000000",
      address_line_1: "1 Test Street",
      address_line_2: "Floor 2",
      city: "Lahore",
      postal_code: "54000",
      label: "Home",
    };

    const result = await createAddress(body);

    expect(callCounts.addressCreate).toBe(1);
    expect(result.address).toMatchObject({
      recipient_name: "New Person",
      phone: "03000000000",
      address_line_1: "1 Test Street",
      address_line_2: "Floor 2",
      city: "Lahore",
      postal_code: "54000",
      label: "Home",
      is_default: false,
    });
    expect(recordedRequests).toContain("POST /api/v1/addresses");
  });

  it("PUT /addresses/{id} returns { address }", async () => {
    const result = await updateAddress(1, {
      recipient_name: "Updated Name",
      city: "Islamabad",
    });

    expect(callCounts.addressUpdate).toBe(1);
    expect(result.address).toMatchObject({
      id: 1,
      recipient_name: "Updated Name",
      city: "Islamabad",
    });
    expect(recordedRequests).toContain("PUT /api/v1/addresses/1");
  });

  it("DELETE /addresses/{id} returns { message: 'Address deleted.' }", async () => {
    const result = await deleteAddress(2);

    expect(callCounts.addressDelete).toBe(1);
    expect(result).toEqual({ message: "Address deleted." });
    expect(recordedRequests).toContain("DELETE /api/v1/addresses/2");
  });

  it("POST /addresses/{id}/default returns { message: 'Default address updated.' }", async () => {
    const result = await setDefaultAddress(2);

    expect(callCounts.addressSetDefault).toBe(1);
    expect(result).toEqual({ message: "Default address updated." });
    expect(recordedRequests).toContain("POST /api/v1/addresses/2/default");
  });

  it("unknown address returns 404 with { message: 'Not Found' }", async () => {
    await expect(deleteAddress(99999)).rejects.toMatchObject({
      response: { status: 404, data: { message: "Not Found" } },
    });
  });

  it("validation failure returns 422 with errors bag", async () => {
    await expect(
      createAddress({
        recipient_name: "",
        phone: "",
        address_line_1: "",
        city: "",
      }),
    ).rejects.toMatchObject({
      response: {
        status: 422,
        data: {
          message: "The given data was invalid.",
          errors: {
            recipient_name: expect.any(Array),
            phone: expect.any(Array),
            address_line_1: expect.any(Array),
            city: expect.any(Array),
          },
        },
      },
    });
  });
});
