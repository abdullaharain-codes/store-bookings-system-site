import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnnouncerProvider } from "../components/common/Announcer";
import AccountIndex from "../routes/account._index";
import ProfileView from "../components/profile/ProfileView";
import { session } from "./handlers";
import {
  getLastProfileUpdateBody,
  getProfileGetCount,
  resetProfileUpdateTracking,
  setPasswordChangeError,
} from "./handlers-account";

type FlowUser = ReturnType<typeof userEvent.setup>;

async function fill(user: FlowUser, label: RegExp, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.click(input);
  await user.paste(value);
}

function renderWithProviders() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnouncerProvider>
        <MemoryRouter initialEntries={["/account"]}>
          <Routes>
            <Route path="/account" element={<AccountIndex />} />
            <Route path="/account/profile" element={<ProfileView />} />
          </Routes>
        </MemoryRouter>
      </AnnouncerProvider>
    </QueryClientProvider>
  );
}

describe("profile flow", () => {
  beforeEach(() => {
    resetProfileUpdateTracking();
  });

  it("sign in -> hub -> Profile link -> edit name -> see announcement -> change password", async () => {
    session.start();
    const user = userEvent.setup();
    renderWithProviders();

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /My account/i })).toBeInTheDocument());
    await user.click(screen.getByRole("link", { name: /Profile/i }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /My Profile/i })).toBeInTheDocument());

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /My Profile/i })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue(/Ada/i)).toBeInTheDocument());

    await fill(user, /Name/i, "Ada Updated");
    await user.click(screen.getByRole("button", { name: /Save/i }));
    const statusName = await screen.findByRole("status");
    expect(statusName).toHaveTextContent(/Profile updated/i);

    setPasswordChangeError({ status: 422, message: "The current password is incorrect." });
    await fill(user, /Current password/i, "wrong");
    await fill(user, /^New password$/i, "newpass123");
    await fill(user, /Confirm new password/i, "newpass123");
    await user.click(screen.getByRole("button", { name: /Change password/i }));
    await waitFor(() => expect(screen.getByText(/The current password is incorrect/i)).toBeInTheDocument());

    await fill(user, /Current password/i, "oldpass123");
    await fill(user, /^New password$/i, "newpass123");
    await fill(user, /Confirm new password/i, "newpass123");
    await user.click(screen.getByRole("button", { name: /Change password/i }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Password changed/i);
    await waitFor(() => expect((screen.getByLabelText(/Current password/i) as HTMLInputElement).value).toBe(""));
    expect((screen.getByLabelText(/^New password$/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Confirm new password/i) as HTMLInputElement).value).toBe("");
  });

  it("saving the name sends PUT/PATCH body that equals exactly {name} with no email key and refetches profile", async () => {
    session.start();
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AnnouncerProvider>
          <MemoryRouter initialEntries={["/account/profile"]}>
            <Routes>
              <Route path="/account/profile" element={<ProfileView />} />
            </Routes>
          </MemoryRouter>
        </AnnouncerProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: /My Profile/i })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue(/Ada/i)).toBeInTheDocument());

    const beforeGets = getProfileGetCount();
    await fill(user, /Name/i, "Ada Updated");
    await user.click(screen.getByRole("button", { name: /Save/i }));
    await screen.findByRole("status");

    expect(getLastProfileUpdateBody()).toEqual({ name: "Ada Updated" });
    expect(Object.keys(getLastProfileUpdateBody() ?? {})).toEqual(["name"]);
    expect(getLastProfileUpdateBody()).not.toHaveProperty("email");
    await waitFor(() => expect(getProfileGetCount()).toBeGreaterThan(beforeGets));
  });
});
