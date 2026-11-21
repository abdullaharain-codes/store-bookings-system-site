/**
 * Typed wrappers around the address endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\AddressController exactly:
 * - GET    /addresses           -> { addresses: Address[] }
 * - POST   /addresses           -> { address: Address }           (201)
 * - PUT    /addresses/{id}      -> { address: Address }
 * - DELETE /addresses/{id}      -> { message }
 * - POST   /addresses/{id}/default -> { message }
 */
import apiClient from "./api-client";

// ─── Entity types ───────────────────────────────────────────────────────────

export interface Address {
  id: number;
  user_id: number;
  label: string | null;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  postal_code: string | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Request types ──────────────────────────────────────────────────────────

export interface CreateAddressData {
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  postal_code?: string;
  label?: string;
  is_default?: boolean;
}

/** Updatable address fields — is_default is NEVER sent by the forms (Part 5). */
export type UpdateAddressData = Partial<
  Omit<CreateAddressData, "is_default">
>;

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface AddressesResponse {
  addresses: Address[];
}

export interface AddressResponse {
  address: Address;
}

export interface AddressMessageResponse {
  message: string;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** List all addresses for the authenticated user. */
export async function getAddresses(): Promise<AddressesResponse> {
  const { data } = await apiClient.get<AddressesResponse>("/addresses");
  return data;
}

/** Create a new address. */
export async function createAddress(
  addressData: CreateAddressData,
): Promise<AddressResponse> {
  const { data } = await apiClient.post<AddressResponse>(
    "/addresses",
    addressData,
  );
  return data;
}

/** Update an existing address. */
export async function updateAddress(
  id: number,
  addressData: UpdateAddressData,
): Promise<AddressResponse> {
  const { data: result } = await apiClient.put<AddressResponse>(
    `/addresses/${id}`,
    addressData,
  );
  return result;
}

/** Delete an address. */
export async function deleteAddress(id: number): Promise<AddressMessageResponse> {
  const { data } = await apiClient.delete<AddressMessageResponse>(
    `/addresses/${id}`,
  );
  return data;
}

/** Set an address as the user's default. */
export async function setDefaultAddress(
  id: number,
): Promise<AddressMessageResponse> {
  const { data } = await apiClient.post<AddressMessageResponse>(
    `/addresses/${id}/default`,
  );
  return data;
}
