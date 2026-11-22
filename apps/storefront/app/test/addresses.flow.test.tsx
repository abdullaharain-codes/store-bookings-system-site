import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@ecommerce/api-client";
import { AnnouncerProvider } from "../components/common/Announcer";
import AccountIndex from "../routes/account._index";
import AddressesView from "../components/addresses/AddressesView";
import { session } from "./handlers";
import { resetAddressesSource, setAddressesSource } from "./handlers-addresses";

const testUser = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 2, name: "Customer", slug: "customer" },
};

function renderFlow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnouncerProvider>
        <MemoryRouter initialEntries={["/account"]}>
          <Routes>
            <Route path="/account" element={<AccountIndex />} />
            <Route path="/account/addresses" element={<AddressesView />} />
          </Routes>
        </MemoryRouter>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe("addresses flow", () => {
  beforeEach(() => {
    resetAddressesSource();
    session.start();
    useAuthStore.setState({
      user: testUser,
      isAuthenticated: true,
      isSessionChecked: true,
    });
    setAddressesSource([
      {
        id: 1,
        user_id: 7,
        label: "Home",
        recipient_name: "Ali Khan",
        phone: "03001234567",
        address_line_1: "12 Mall Road",
        address_line_2: null,
        city: "Lahore",
        postal_code: "54000",
        is_default: true,
        created_at: "2026-08-25T10:00:00.000000Z",
        updated_at: "2026-08-25T10:00:00.000000Z",
      },
    ]);
  });

  it("sign in, open /account, click Saved addresses, add, set default, delete other", async () => {
    const user = userEvent.setup();
    renderFlow();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "My account" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("link", { name: "Saved addresses" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Saved addresses" })).toBeInTheDocument(),
    );
    await screen.findByText("12 Mall Road");

    await user.click(screen.getByRole("button", { name: "Add address" }));
    await user.type(await screen.findByLabelText("Recipient name"), "New Person");
    await user.type(screen.getByLabelText("Phone"), "03000000000");
    await user.type(screen.getByLabelText("Address line 1"), "99 New Street");
    await user.type(screen.getByLabelText("City"), "Karachi");
    await user.click(screen.getByRole("button", { name: "Save address" }));

    expect(await screen.findByText("99 New Street")).toBeInTheDocument();

    // Set the newly added address as default (it is the non-default one; id will be 2)
    const setDefaultButton = await screen.findByRole("button", { name: "Set as default" });
    await user.click(setDefaultButton);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Default address updated"),
    );

    // Delete the other (now non-default) address
    await waitFor(async () => {
      const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    // delete the first address (Home / 12 Mall Road) which should now be non-default
    const homeCardDelete = deleteButtons.find((btn) =>
      btn.closest("article,li,div")?.textContent?.includes("12 Mall Road"),
    );
    await user.click(homeCardDelete ?? deleteButtons[0]);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("12 Mall Road")).not.toBeInTheDocument(),
    );
  });
});
