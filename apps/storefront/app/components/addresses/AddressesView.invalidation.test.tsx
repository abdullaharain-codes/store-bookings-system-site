import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "@ecommerce/api-client";
import { renderWithProviders } from "../../test/utils";
import { callCounts, session } from "../../test/handlers";
import { resetAddressesSource } from "../../test/handlers-addresses";
import AddressesView from "./AddressesView";

const testUser = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 2, name: "Customer", slug: "customer" },
};

describe("AddressesView query invalidation", () => {
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

  it("invalidates the addresses query after delete so the list is refetched", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddressesView />, {
      entry: "/account/addresses",
      withAnnouncer: true,
    });

    await screen.findByRole("heading", { level: 1, name: "Saved addresses" });
    await screen.findByText("8 Clifton Block 5");
    const getCountAfterLoad = callCounts.addresses;

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[1]);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(callCounts.addressDelete).toBe(1));
    await waitFor(() => expect(callCounts.addresses).toBeGreaterThan(getCountAfterLoad));
  });
});
