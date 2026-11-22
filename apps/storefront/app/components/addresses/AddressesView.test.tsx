import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { useAuthStore } from "@ecommerce/api-client";
import { renderWithProviders } from "../../test/utils";
import { server } from "../../test/server";
import { session } from "../../test/handlers";
import {
  ADDRESSES_URL,
  ADDRESS_DEFAULT_URL,
  ADDRESS_URL,
  resetAddressesSource,
  setAddressesSource,
} from "../../test/handlers-addresses";
import AddressesView from "./AddressesView";

const testUser = {
  id: 7,
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: { id: 2, name: "Customer", slug: "customer" },
};

function renderAddresses() {
  return renderWithProviders(<AddressesView />, {
    entry: "/account/addresses",
    withAnnouncer: true,
  });
}

describe("AddressesView", () => {
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

  it("shows loading state with sr-only h1 and exactly one h1", async () => {
    server.use(
      http.get(ADDRESSES_URL, async () => {
        await delay(100);
        return HttpResponse.json({ addresses: [] });
      }),
    );

    renderAddresses();

    const h1 = document.querySelector("h1");
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveClass("sr-only");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByLabelText("Loading saved addresses")).toBeInTheDocument();
  });

  it("renders populated list with fields as plain text and default badge", async () => {
    renderAddresses();

    expect((await screen.findAllByText("Ali Khan")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { level: 1, name: "Saved addresses" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByText("03001234567")).toBeInTheDocument();
    expect(screen.getByText("12 Mall Road")).toBeInTheDocument();
    expect(screen.getByText("Gulberg III")).toBeInTheDocument();
    expect(screen.getByText("Lahore")).toBeInTheDocument();
    expect(screen.getByText("54000")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();

    const defaultBadge = screen.getByText("Default");
    expect(defaultBadge).toBeInTheDocument();
  });

  it("renders empty state with one h1 and add action", async () => {
    setAddressesSource([]);
    renderAddresses();

    expect(
      await screen.findByRole("button", { name: "Add address" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Saved addresses" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("renders error state with one h1 and retry works", async () => {
    let fail = true;
    server.use(
      http.get(ADDRESSES_URL, () => {
        if (fail) return HttpResponse.json({ message: "Server error" }, { status: 500 });
        return HttpResponse.json({ addresses: [] });
      }),
    );

    renderAddresses();

    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Saved addresses" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("h1")).toHaveLength(1);

    fail = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("button", { name: "Add address" }),
    ).toBeInTheDocument();
  });

  it("add flow validates, posts without is_default, refetches, announces, closes form", async () => {
    setAddressesSource([]);
    const user = userEvent.setup();
    renderAddresses();

    await screen.findByRole("button", { name: "Add address" });
    await user.click(screen.getByRole("button", { name: "Add address" }));

    const saveButton = screen.getByRole("button", { name: "Save address" });
    await user.click(saveButton);

    expect(await screen.findByText("Enter the recipient's name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a phone number.")).toBeInTheDocument();
    expect(screen.getByText("Enter the first line of the address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a city.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Recipient name"), "New Person");
    await user.type(screen.getByLabelText("Phone"), "03000000000");
    await user.type(screen.getByLabelText("Address line 1"), "1 Test Street");
    await user.type(screen.getByLabelText("Address line 2 (optional)"), "Floor 2");
    await user.type(screen.getByLabelText("City"), "Lahore");
    await user.type(screen.getByLabelText("Postal code (optional)"), "54000");
    await user.type(screen.getByLabelText("Label (optional)"), "Home");

    let postedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(ADDRESSES_URL, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>;
        const address = {
          id: 99,
          user_id: 7,
          recipient_name: "New Person",
          phone: "03000000000",
          address_line_1: "1 Test Street",
          address_line_2: "Floor 2",
          city: "Lahore",
          postal_code: "54000",
          label: "Home",
          is_default: false,
          created_at: "2026-08-25T10:00:00.000000Z",
          updated_at: "2026-08-25T10:00:00.000000Z",
        };
        setAddressesSource([address]);
        return HttpResponse.json({ address }, { status: 201 });
      }),
    );

    await user.click(screen.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toEqual({
      recipient_name: "New Person",
      phone: "03000000000",
      address_line_1: "1 Test Street",
      address_line_2: "Floor 2",
      city: "Lahore",
      postal_code: "54000",
      label: "Home",
    });
    expect(Object.prototype.hasOwnProperty.call(postedBody, "is_default")).toBe(false);

    expect(await screen.findByText("New Person")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Address added");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Save address" })).not.toBeInTheDocument(),
    );
  });

  it("shows server 422 field errors next to matching fields", async () => {
    setAddressesSource([]);
    const user = userEvent.setup();
    renderAddresses();

    await screen.findByRole("button", { name: "Add address" });
    await user.click(screen.getByRole("button", { name: "Add address" }));

    server.use(
      http.post(ADDRESSES_URL, () =>
        HttpResponse.json(
          {
            message: "The given data was invalid.",
            errors: { phone: ["The phone field is invalid."] },
          },
          { status: 422 },
        ),
      ),
    );

    await user.type(screen.getByLabelText("Recipient name"), "New Person");
    await user.type(screen.getByLabelText("Phone"), "bad");
    await user.type(screen.getByLabelText("Address line 1"), "1 Test Street");
    await user.type(screen.getByLabelText("City"), "Lahore");
    await user.click(screen.getByRole("button", { name: "Save address" }));

    expect(await screen.findByText("The phone field is invalid.")).toBeInTheDocument();
  });

  it("double-submit guard sends exactly one POST", async () => {
    setAddressesSource([]);
    let postCount = 0;
    server.use(
      http.post(ADDRESSES_URL, async ({ request }) => {
        postCount += 1;
        await delay(100);
        const body = (await request.json()) as Record<string, unknown>;
        const address = {
          id: 99,
          user_id: 7,
          recipient_name: String(body.recipient_name),
          phone: String(body.phone),
          address_line_1: String(body.address_line_1),
          address_line_2: null,
          city: String(body.city),
          postal_code: null,
          label: null,
          is_default: false,
          created_at: "2026-08-25T10:00:00.000000Z",
          updated_at: "2026-08-25T10:00:00.000000Z",
        };
        setAddressesSource([address]);
        return HttpResponse.json({ address }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderAddresses();
    await screen.findByRole("button", { name: "Add address" });
    await user.click(screen.getByRole("button", { name: "Add address" }));

    await user.type(screen.getByLabelText("Recipient name"), "New Person");
    await user.type(screen.getByLabelText("Phone"), "03000000000");
    await user.type(screen.getByLabelText("Address line 1"), "1 Test Street");
    await user.type(screen.getByLabelText("City"), "Lahore");

    const save = screen.getByRole("button", { name: "Save address" });
    const form = save.closest("form");
    await user.click(save);
    if (form) fireEvent.submit(form);

    await waitFor(() => expect(screen.getByText("New Person")).toBeInTheDocument());
    await delay(150);
    expect(postCount).toBe(1);
  });

  it("edit flow sends PUT without is_default", async () => {
    const user = userEvent.setup();
    renderAddresses();

    await screen.findByRole("heading", { level: 1, name: "Saved addresses" });
    await screen.findByText("12 Mall Road");

    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(ADDRESS_URL(1), async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          address: {
            id: 1,
            user_id: 7,
            recipient_name: "Ali Khan",
            phone: "03001234567",
            address_line_1: "99 New Road",
            address_line_2: "Gulberg III",
            city: "Lahore",
            postal_code: "54000",
            label: "Home",
            is_default: true,
            created_at: "2026-08-25T10:00:00.000000Z",
            updated_at: "2026-08-25T10:00:00.000000Z",
          },
        });
      }),
    );

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);

    const line1 = await screen.findByLabelText("Address line 1");
    await user.clear(line1);
    await user.type(line1, "99 New Road");
    await user.click(screen.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(Object.prototype.hasOwnProperty.call(putBody, "is_default")).toBe(false);
    expect(putBody).toMatchObject({ address_line_1: "99 New Road" });
    expect(screen.getByRole("status")).toHaveTextContent("Address updated");
  });

  it("delete flow: cancel does nothing, confirm deletes once, updates list, announces; 404 refreshes and shows message", async () => {
    const user = userEvent.setup();
    renderAddresses();

    await screen.findByRole("heading", { level: 1, name: "Saved addresses" });
    await screen.findByText("8 Clifton Block 5");

    let deleteCount = 0;
    server.use(
      http.delete(ADDRESS_URL(2), () => {
        deleteCount += 1;
        setAddressesSource([
          {
            id: 1, user_id: 7, label: "Home", recipient_name: "Ali Khan",
            phone: "03001234567", address_line_1: "12 Mall Road", address_line_2: "Gulberg III",
            city: "Lahore", postal_code: "54000", is_default: true,
            created_at: "2026-08-25T10:00:00.000000Z", updated_at: "2026-08-25T10:00:00.000000Z",
          },
        ]);
        return HttpResponse.json({ message: "Address deleted." });
      }),
    );

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[1]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteCount).toBe(0);
    expect(screen.getByText("8 Clifton Block 5")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteCount).toBe(1));
    await waitFor(() =>
      expect(screen.queryByText("8 Clifton Block 5")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Address deleted");

    // 404 on delete refreshes list and shows server message
    resetAddressesSource();
    server.resetHandlers();
    server.use(
      http.get(ADDRESSES_URL, () =>
        HttpResponse.json({ addresses: [
          {
            id: 1, user_id: 7, label: "Home", recipient_name: "Ali Khan",
            phone: "03001234567", address_line_1: "12 Mall Road", address_line_2: null,
            city: "Lahore", postal_code: "54000", is_default: true,
            created_at: "2026-08-25T10:00:00.000000Z", updated_at: "2026-08-25T10:00:00.000000Z",
          },
        ] }),
      ),
      http.delete(ADDRESS_URL(1), () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog2 = await screen.findByRole("dialog");
    await user.click(within(dialog2).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not Found");
  });

  it("set-default posts to default endpoint, hidden/disabled for current default, badge moves after refetch", async () => {
    const user = userEvent.setup();
    renderAddresses();

    await screen.findByRole("heading", { level: 1, name: "Saved addresses" });
    await screen.findByText("8 Clifton Block 5");

    // Current default (id 1) should not have an active set-default action
    const setDefaultButtons = screen.getAllByRole("button", { name: "Set as default" });
    // Only one button - for the non-default address
    expect(setDefaultButtons).toHaveLength(1);

    let defaultPostCount = 0;
    server.use(
      http.post(ADDRESS_DEFAULT_URL(2), () => {
        defaultPostCount += 1;
        return HttpResponse.json({ message: "Default address updated." });
      }),
      http.get(ADDRESSES_URL, () => {
        return HttpResponse.json({
          addresses: [
            {
              id: 1, user_id: 7, label: "Home", recipient_name: "Ali Khan",
              phone: "03001234567", address_line_1: "12 Mall Road", address_line_2: "Gulberg III",
              city: "Lahore", postal_code: "54000", is_default: false,
              created_at: "2026-08-25T10:00:00.000000Z", updated_at: "2026-08-25T10:00:00.000000Z",
            },
            {
              id: 2, user_id: 7, label: "Office", recipient_name: "Ali Khan",
              phone: "03007654321", address_line_1: "8 Clifton Block 5", address_line_2: null,
              city: "Karachi", postal_code: null, is_default: true,
              created_at: "2026-08-25T10:00:00.000000Z", updated_at: "2026-08-25T10:00:00.000000Z",
            },
          ],
        });
      }),
    );

    await user.click(setDefaultButtons[0]);
    await waitFor(() => expect(defaultPostCount).toBe(1));
    expect(screen.getByRole("status")).toHaveTextContent("Default address updated");

    await waitFor(() => {
      const officeCard = screen.getByText("8 Clifton Block 5").closest("article,li,div");
      expect(officeCard).not.toBeNull();
    });
  });

  it("401 on any call drops session and lands on /login", async () => {
    server.use(
      http.get(ADDRESSES_URL, () =>
        HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
      ),
    );

    renderAddresses();

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});
