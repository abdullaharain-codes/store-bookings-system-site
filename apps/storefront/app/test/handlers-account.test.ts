import { describe, expect, it } from "vitest";
import { changePassword, getProfile, updateProfile } from "@ecommerce/api-client";
import { deleteAddress, setDefaultAddress, updateAddress } from "@ecommerce/api-client";
import { session } from "./handlers";

describe("account handlers agreement", () => {
  it("getProfile matches handler", async () => {
    session.start();
    const res = await getProfile();
    expect(res.user.email).toBe("ada@example.test");
  });

  it("updateProfile matches handler (name only)", async () => {
    session.start();
    const res = await updateProfile({ name: "Ada" });
    expect(res.user.name).toBe("Ada");
  });

  it("changePassword matches handler", async () => {
    session.start();
    const res = await changePassword({
      current_password: "oldpass123",
      new_password: "newpass123",
      new_password_confirmation: "newpass123",
    });
    expect(res.message).toBe("Password changed.");
  });

  it("address mutations match handlers", async () => {
    session.start();
    const up = await updateAddress(1, { recipient_name: "X" });
    expect(up.address.recipient_name).toBeTruthy();
    const del = await deleteAddress(1);
    expect(del.message).toBe("Address deleted.");
    const def = await setDefaultAddress(2);
    expect(def.message).toBe("Default address updated.");
  });
});
