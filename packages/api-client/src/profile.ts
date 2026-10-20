/**
 * Typed wrappers around the customer profile self-service endpoints
 * (Laravel API v1, PRD §5.2).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\ProfileController exactly
 * — verified against the controller rather than guessed:
 * - GET  /profile        -> { user: Profile }   (role eager-loaded)
 * - PUT  /profile        -> { user: Profile }   (PATCH accepted too)
 * - POST /profile/password -> { message: "Password changed." }
 *
 * All three are auth:sanctum with no admin gate and no {id} in the URL — the
 * authenticated user always acts on their own record (architecture.md §5, no
 * ownership gap). Only `name` is editable (the users table has no phone
 * column, and email is deliberately withheld — it is the login identifier and
 * no verification flow exists to re-prove ownership). Password change is
 * throttle-limited per user (5/min, rules.md §9) and requires proof of the
 * current password; the response carries no credential data of any kind.
 */
import apiClient from "./api-client";
import type { User } from "./stores/auth-store";

// ─── Entity types ───────────────────────────────────────────────────────────

/**
 * The full serialized User as the profile endpoints return it — the
 * auth-store's User (id/name/email/role) plus the audit timestamps and the
 * verified-email marker that /profile exposes. password/remember_token stay
 * hidden on the server; role is eager-loaded.
 */
export interface Profile extends User {
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Envelope / payload types ───────────────────────────────────────────────

export interface ProfileResponse {
  user: Profile;
}

/**
 * PUT/PATCH /profile payload. Only `name` is editable (sometimes|string|
 * max:255); email is not part of the contract — sending it is ignored, not
 * applied, and a wrong type/length is a 422.
 */
export interface UpdateProfileData {
  name?: string;
}

/**
 * POST /profile/password payload. `new_password` clears the same strength
 * gate as registration (min:8) plus the HTTP-only `confirmed` rule, which
 * requires new_password_confirmation to match.
 */
export interface ChangePasswordData {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}

export interface ChangePasswordResponse {
  message: string;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** The authenticated user's own profile (view-only). */
export async function getProfile(): Promise<ProfileResponse> {
  const { data } = await apiClient.get<ProfileResponse>("/profile");
  return data;
}

/** Update the mutable profile fields (currently just `name`). */
export async function updateProfile(
  data: UpdateProfileData,
): Promise<ProfileResponse> {
  const { data: response } = await apiClient.put<ProfileResponse>(
    "/profile",
    data,
  );
  return response;
}

/**
 * Change the account password after proving the current one. Throttled per
 * user (5/min); a wrong current password is a 422. The response is a bare
 * success message — credentials are never returned or logged (rules.md §9).
 */
export async function changePassword(
  data: ChangePasswordData,
): Promise<ChangePasswordResponse> {
  const { data: response } = await apiClient.post<ChangePasswordResponse>(
    "/profile/password",
    data,
  );
  return response;
}