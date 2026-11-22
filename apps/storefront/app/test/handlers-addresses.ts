import { http, HttpResponse } from "msw";
import type { Address } from "@ecommerce/api-client";
import { API_URL, callCounts, session, testUser } from "./handlers";

/**
 * Single source of truth for address MSW handlers (GET, POST, PUT, DELETE,
 * POST default). Replaces the split address handling that used to live in
 * handlers-checkout.ts (GET/POST) and handlers-account.ts (PUT/DELETE/default)
 * with different in-memory pools.
 *
 * Contract mirrored from the real server (STEP 0, 2026-11-20):
 * - GET    /addresses              -> 200 { addresses: Address[] } (plain array)
 * - POST   /addresses              -> 201 { address: Address }
 * - PUT    /addresses/{id}         -> 200 { address: Address }
 * - DELETE /addresses/{id}         -> 200 { message: "Address deleted." }
 * - POST   /addresses/{id}/default -> 200 { message: "Default address updated." }
 * - Ownership/unknown -> 404 { message: "Not Found" }
 * - Validation failure -> 422 { message: "The given data was invalid.", errors: {...} }
 *
 * StoreAddressRequest: recipient_name required|string|max:255, phone required|string|max:20,
 * address_line_1 required|string|max:255, address_line_2 nullable|string|max:255,
 * city required|string|max:100, postal_code nullable|string|max:20,
 * label nullable|string|max:50, is_default nullable|boolean.
 * UpdateAddressRequest: same fields; recipient_name/phone/address_line_1/city are
 * sometimes|required when present; others nullable. is_default nullable|boolean.
 */

export const ADDRESSES_URL = `${API_URL}/addresses`;
export const ADDRESS_URL = (id: number | string) => `${API_URL}/addresses/${id}`;
export const ADDRESS_DEFAULT_URL = (id: number | string) =>
  `${API_URL}/addresses/${id}/default`;

export const testAddresses: Address[] = [
  {
    id: 1,
    user_id: testUser.id,
    label: "Home",
    recipient_name: "Ali Khan",
    phone: "03001234567",
    address_line_1: "12 Mall Road",
    address_line_2: "Gulberg III",
    city: "Lahore",
    postal_code: "54000",
    is_default: true,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
  },
  {
    id: 2,
    user_id: testUser.id,
    label: "Office",
    recipient_name: "Ali Khan",
    phone: "03007654321",
    address_line_1: "8 Clifton Block 5",
    address_line_2: null,
    city: "Karachi",
    postal_code: null,
    is_default: false,
    created_at: "2026-08-25T10:00:00.000000Z",
    updated_at: "2026-08-25T10:00:00.000000Z",
  },
];

let addressesSource: Address[] = [...testAddresses];
let addressSequence = Math.max(...testAddresses.map((address) => address.id));

export function setAddressesSource(addresses: Address[]): void {
  addressesSource = addresses.map((address) => ({ ...address }));
  addressSequence = Math.max(addressSequence, ...addresses.map((address) => address.id));
}

/** Compatibility alias for handlers-account imports. */
export function setAddressesSourceAccount(addresses: Address[]): void {
  setAddressesSource(addresses);
}

export function resetAddressesSource(): void {
  addressesSource = testAddresses.map((address) => ({ ...address }));
  addressSequence = Math.max(...testAddresses.map((address) => address.id));
}

export function getAddressesSource(): Address[] {
  return addressesSource;
}

const unauthenticated = () =>
  HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });

const notFound = () => HttpResponse.json({ message: "Not Found" }, { status: 404 });

const validationFailed = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { message: "The given data was invalid.", errors },
    { status: 422 },
  );

type AddressBody = Record<string, unknown>;

function validateStoreAddressBody(body: AddressBody): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  const required = (field: string, label: string, max: number) => {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors[field] = [`The ${label} field is required.`];
    } else if (value.length > max) {
      errors[field] = [`The ${label} field must not be greater than ${max} characters.`];
    }
  };

  const optional = (field: string, label: string, max: number) => {
    const value = body[field];
    if (value === undefined || value === null || value === "") return;
    if (typeof value !== "string") {
      errors[field] = [`The ${label} field must be a string.`];
    } else if (value.length > max) {
      errors[field] = [`The ${label} field must not be greater than ${max} characters.`];
    }
  };

  required("recipient_name", "recipient name", 255);
  required("phone", "phone", 20);
  required("address_line_1", "address line 1", 255);
  required("city", "city", 100);
  optional("address_line_2", "address line 2", 255);
  optional("postal_code", "postal code", 20);
  optional("label", "label", 50);

  return errors;
}

function validateUpdateAddressBody(body: AddressBody): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  const sometimesRequiredString = (field: string, label: string, max: number) => {
    if (!(field in body)) return;
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors[field] = [`The ${label} field is required.`];
    } else if (value.length > max) {
      errors[field] = [`The ${label} field must not be greater than ${max} characters.`];
    }
  };

  const optional = (field: string, label: string, max: number) => {
    if (!(field in body)) return;
    const value = body[field];
    if (value === undefined || value === null || value === "") return;
    if (typeof value !== "string") {
      errors[field] = [`The ${label} field must be a string.`];
    } else if (value.length > max) {
      errors[field] = [`The ${label} field must not be greater than ${max} characters.`];
    }
  };

  sometimesRequiredString("recipient_name", "recipient name", 255);
  sometimesRequiredString("phone", "phone", 20);
  sometimesRequiredString("address_line_1", "address line 1", 255);
  sometimesRequiredString("city", "city", 100);
  optional("address_line_2", "address line 2", 255);
  optional("postal_code", "postal code", 20);
  optional("label", "label", 50);

  return errors;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export const addressHandlers = [
  http.get(ADDRESSES_URL, () => {
    callCounts.addresses += 1;
    if (!session.active) return unauthenticated();
    return HttpResponse.json({ addresses: addressesSource });
  }),

  http.post(ADDRESSES_URL, async ({ request }) => {
    callCounts.addressCreate += 1;
    if (!session.active) return unauthenticated();

    const body = (await request.json()) as AddressBody;
    const errors = validateStoreAddressBody(body);
    if (Object.keys(errors).length > 0) return validationFailed(errors);

    addressSequence += 1;
    const address: Address = {
      id: addressSequence,
      user_id: testUser.id,
      label: normalizeNullableString(body.label),
      recipient_name: String(body.recipient_name),
      phone: String(body.phone),
      address_line_1: String(body.address_line_1),
      address_line_2: normalizeNullableString(body.address_line_2),
      city: String(body.city),
      postal_code: normalizeNullableString(body.postal_code),
      is_default: false,
      created_at: "2026-08-25T10:00:00.000000Z",
      updated_at: "2026-08-25T10:00:00.000000Z",
    };
    addressesSource = [...addressesSource, address];
    return HttpResponse.json({ address }, { status: 201 });
  }),

  http.put(ADDRESS_URL(":id"), async ({ request, params }) => {
    callCounts.addressUpdate += 1;
    if (!session.active) return unauthenticated();
    const id = Number(params.id);
    const index = addressesSource.findIndex((address) => address.id === id);
    if (index === -1) return notFound();

    const body = (await request.json()) as AddressBody;
    const errors = validateUpdateAddressBody(body);
    if (Object.keys(errors).length > 0) return validationFailed(errors);

    const current = addressesSource[index];
    const updated: Address = {
      ...current,
      ...(typeof body.recipient_name === "string" ? { recipient_name: body.recipient_name } : {}),
      ...(typeof body.phone === "string" ? { phone: body.phone } : {}),
      ...(typeof body.address_line_1 === "string" ? { address_line_1: body.address_line_1 } : {}),
      ...("address_line_2" in body ? { address_line_2: normalizeNullableString(body.address_line_2) } : {}),
      ...(typeof body.city === "string" ? { city: body.city } : {}),
      ...("postal_code" in body ? { postal_code: normalizeNullableString(body.postal_code) } : {}),
      ...("label" in body ? { label: normalizeNullableString(body.label) } : {}),
      updated_at: "2026-08-25T10:00:00.000000Z",
    };
    addressesSource = addressesSource.map((address, idx) => (idx === index ? updated : address));
    return HttpResponse.json({ address: updated });
  }),

  http.delete(ADDRESS_URL(":id"), ({ params }) => {
    callCounts.addressDelete += 1;
    if (!session.active) return unauthenticated();
    const id = Number(params.id);
    const index = addressesSource.findIndex((address) => address.id === id);
    if (index === -1) return notFound();
    addressesSource = addressesSource.filter((address) => address.id !== id);
    return HttpResponse.json({ message: "Address deleted." });
  }),

  http.post(ADDRESS_DEFAULT_URL(":id"), ({ params }) => {
    callCounts.addressSetDefault += 1;
    if (!session.active) return unauthenticated();
    const id = Number(params.id);
    const index = addressesSource.findIndex((address) => address.id === id);
    if (index === -1) return notFound();
    addressesSource = addressesSource.map((address) => ({
      ...address,
      is_default: address.id === id,
      updated_at: address.id === id ? "2026-08-25T10:00:00.000000Z" : address.updated_at,
    }));
    return HttpResponse.json({ message: "Default address updated." });
  }),
];
