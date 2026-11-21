import { http, HttpResponse } from "msw";
import type { Address, User } from "@ecommerce/api-client";
import { API_URL, session, testUser } from "./handlers";

const unauthenticated = () =>
  HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });

const validationFailed = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { message: "The given data was invalid.", errors },
    { status: 422 },
  );

export const PROFILE_URL = `${API_URL}/profile`;
export const PROFILE_PASSWORD_URL = `${API_URL}/profile/password`;
export const ADDRESSES_URL = `${API_URL}/addresses`;
export const ADDRESS_URL = (id: number | string) => `${API_URL}/addresses/${id}`;
export const ADDRESS_DEFAULT_URL = (id: number | string) =>
  `${API_URL}/addresses/${id}/default`;

type ProfileRecord = User & {
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface ProfileUpdateBody {
  name?: string;
  email?: string;
}

interface PasswordChangeBody {
  current_password?: string;
  new_password?: string;
  new_password_confirmation?: string;
}

let profileSource: User = { ...testUser };
let profileUser: ProfileRecord = {
  ...testUser,
  email_verified_at: null,
  created_at: "2026-01-01T00:00:00.000000Z",
  updated_at: "2026-01-01T00:00:00.000000Z",
};

let passwordChangeError: { status: number; message?: string; errors?: Record<string, string[]> } | null = null;
let profileDelay = 0;

let lastProfileUpdateBody: ProfileUpdateBody | null = null;
let profileGetCount = 0;

export function getLastProfileUpdateBody(): ProfileUpdateBody | null {
  return lastProfileUpdateBody;
}

export function getProfileGetCount(): number {
  return profileGetCount;
}

export function resetProfileUpdateTracking() {
  lastProfileUpdateBody = null;
  profileGetCount = 0;
}

export const testAddresses: Address[] = [
  {
    id: 1,
    user_id: testUser.id,
    label: null,
    recipient_name: "Ada Lovelace",
    phone: "03001234567",
    address_line_1: "123 Main St",
    address_line_2: null,
    city: "Lahore",
    postal_code: "54000",
    is_default: true,
  },
  {
    id: 2,
    user_id: testUser.id,
    label: null,
    recipient_name: "Ada Lovelace",
    phone: "03007654321",
    address_line_1: "456 Second Ave",
    address_line_2: null,
    city: "Karachi",
    postal_code: "75000",
    is_default: false,
  },
];

let addressesSource: Address[] = testAddresses.map((a) => ({ ...a }));

export function setProfileSource(user: User) {
  profileSource = { ...user };
  profileUser = { ...user, email_verified_at: null, created_at: "2026-01-01T00:00:00.000000Z", updated_at: "2026-01-01T00:00:00.000000Z" };
}

export function getProfileSource() {
  return profileUser;
}

export function setPasswordChangeError(err: typeof passwordChangeError) {
  passwordChangeError = err;
}

export function setProfileDelay(ms: number) {
  profileDelay = ms;
}

export function setAddressesSourceAccount(addresses: Address[]) {
  addressesSource = addresses.map((a) => ({ ...a }));
}

export const accountHandlers = [
  http.get(PROFILE_URL, async () => {
    if (!session.active) return unauthenticated();
    if (profileDelay > 0) await new Promise((r) => setTimeout(r, profileDelay));
    profileGetCount += 1;
    return HttpResponse.json({ user: profileUser });
  }),

  http.put(PROFILE_URL, async ({ request }) => {
    if (!session.active) return unauthenticated();
    const body = (await request.json()) as ProfileUpdateBody;
    lastProfileUpdateBody = body;
    // Real server ignores email; only name editable
    if (body.name === "" || (typeof body.name === "string" && body.name.length > 255)) {
      return validationFailed({ name: ["The name field is required."] });
    }
    if (typeof body.name === "string") {
      profileUser = { ...profileUser, name: body.name };
      profileSource = { ...profileSource, name: body.name };
    }
    return HttpResponse.json({ user: profileUser });
  }),

  http.patch(PROFILE_URL, async ({ request }) => {
    if (!session.active) return unauthenticated();
    const body = (await request.json()) as ProfileUpdateBody;
    lastProfileUpdateBody = body;
    if (body.name === "" || (typeof body.name === "string" && body.name.length > 255)) {
      return validationFailed({ name: ["The name field is required."] });
    }
    if (typeof body.name === "string") {
      profileUser = { ...profileUser, name: body.name };
      profileSource = { ...profileSource, name: body.name };
    }
    return HttpResponse.json({ user: profileUser });
  }),

  http.post(PROFILE_PASSWORD_URL, async ({ request }) => {
    if (!session.active) return unauthenticated();
    if (passwordChangeError) {
      const err = passwordChangeError;
      passwordChangeError = null;
      if (err.errors) return validationFailed(err.errors);
      return HttpResponse.json({ message: err.message || "The current password is incorrect." }, { status: err.status || 422 });
    }
    const body = (await request.json()) as PasswordChangeBody;
    if (!body.current_password) {
      return HttpResponse.json({ message: "The current password is incorrect." }, { status: 422 });
    }
    if ((body.new_password || "").length < 8) {
      return validationFailed({ new_password: ["The new password must be at least 8 characters."] });
    }
    if (body.new_password !== body.new_password_confirmation) {
      return validationFailed({ new_password_confirmation: ["The new password confirmation does not match."] });
    }
    return HttpResponse.json({ message: "Password changed." }, { status: 200 });
  }),

  http.put(ADDRESS_URL(":id"), async ({ request, params }) => {
    if (!session.active) return unauthenticated();
    const id = Number(params.id);
    const body = (await request.json()) as Partial<Address>;
    const idx = addressesSource.findIndex((a) => a.id === id);
    if (idx === -1) return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    addressesSource[idx] = { ...addressesSource[idx], ...body };
    return HttpResponse.json({ address: addressesSource[idx] });
  }),

  http.delete(ADDRESS_URL(":id"), async ({ params }) => {
    if (!session.active) return unauthenticated();
    const id = Number(params.id);
    const idx = addressesSource.findIndex((a) => a.id === id);
    if (idx === -1) return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    addressesSource.splice(idx, 1);
    return HttpResponse.json({ message: "Address deleted." });
  }),

  http.post(ADDRESS_DEFAULT_URL(":id"), async ({ params }) => {
    if (!session.active) return unauthenticated();
    const id = Number(params.id);
    const idx = addressesSource.findIndex((a) => a.id === id);
    if (idx === -1) return HttpResponse.json({ message: "Not Found" }, { status: 404 });
    addressesSource = addressesSource.map((a, i) => ({ ...a, is_default: i === idx }));
    return HttpResponse.json({ message: "Default address updated." });
  }),
];
