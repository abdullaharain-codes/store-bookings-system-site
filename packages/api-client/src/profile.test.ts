import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet, put: mockPut, post: mockPost },
}));

import {
  changePassword,
  getProfile,
  updateProfile,
} from "./profile";
import type {
  Profile,
  UpdateProfileData,
} from "./profile";

const profile: Profile = {
  id: 7,
  name: "Ali",
  email: "customer@example.com",
  role: { id: 2, name: "Customer", slug: "customer" },
  email_verified_at: "2026-09-01T10:00:00.000000Z",
  created_at: "2026-08-20T09:00:00.000000Z",
  updated_at: "2026-09-27T22:59:00.000000Z",
};

describe("profile", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockPost.mockReset();
  });

  it("getProfile calls /profile and returns the user envelope", async () => {
    mockGet.mockResolvedValue({ data: { user: profile } });

    const result = await getProfile();

    expect(mockGet).toHaveBeenCalledWith("/profile");
    expect(result).toEqual({ user: profile });
  });

  it("updateProfile PUTs the payload and returns the updated user", async () => {
    mockPut.mockResolvedValue({
      data: { user: { ...profile, name: "Renamed Customer" } },
    });

    const data: UpdateProfileData = { name: "Renamed Customer" };
    const result = await updateProfile(data);

    expect(mockPut).toHaveBeenCalledWith("/profile", { name: "Renamed Customer" });
    expect(result).toEqual({ user: { ...profile, name: "Renamed Customer" } });
  });

  it("changePassword posts the credential payload and returns a bare message", async () => {
    mockPost.mockResolvedValue({ data: { message: "Password changed." } });

    const result = await changePassword({
      current_password: "password123",
      new_password: "brandnewpass1",
      new_password_confirmation: "brandnewpass1",
    });

    expect(mockPost).toHaveBeenCalledWith("/profile/password", {
      current_password: "password123",
      new_password: "brandnewpass1",
      new_password_confirmation: "brandnewpass1",
    });
    expect(result).toEqual({ message: "Password changed." });

    // Documentation-level sanity check (rules.md §9): the response carries no
    // credential fields at all — not in the mocked payload...
    expect("password" in result).toBe(false);
    expect("new_password" in result && "current_password" in result).toBe(false);

    // ...and not in the type either: if ChangePasswordResponse ever gains a
    // password field, this @ts-expect-error stops compiling (permanent guard).
    // @ts-expect-error ChangePasswordResponse must never expose a password field
    result.password;
  });
});