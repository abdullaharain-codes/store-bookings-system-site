import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore, usePendingActionStore } from "@ecommerce/api-client";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CART_ITEMS_URL, REGISTER_URL, callCounts, testUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Register from "./register";

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    fieldErrors: null,
    isSessionChecked: false,
  });
}

async function fillForm(fields: {
  name?: string;
  email?: string;
  password?: string;
  confirmation?: string;
}) {
  const user = userEvent.setup();
  if (fields.name !== undefined) {
    await user.type(screen.getByLabelText("Name"), fields.name);
  }
  if (fields.email !== undefined) {
    await user.type(screen.getByLabelText("Email"), fields.email);
  }
  if (fields.password !== undefined) {
    await user.type(screen.getByLabelText("Password"), fields.password);
  }
  if (fields.confirmation !== undefined) {
    await user.type(
      screen.getByLabelText("Confirm password"),
      fields.confirmation
    );
  }
  return user;
}

/**
 * Lets every pending microtask, timer and React flush land, so an assertion
 * made after it can catch a late `navigateHome()` that clobbered the intended
 * destination. The `waitFor` above only proves the destination was reached at
 * least once; this proves it is still there afterwards.
 */
async function settle(ms = 100) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("Register page", () => {
  beforeEach(() => {
    resetAuthStore();
    usePendingActionStore.getState().clearPendingAction();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one h1 and four labeled fields", () => {
    renderWithProviders(<Register />, { entry: "/register" });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("rejects a short password before calling the API", async () => {
    renderWithProviders(<Register />, { entry: "/register" });

    await fillForm({
      name: "Ada",
      email: "ada@example.test",
      password: "short",
      confirmation: "short",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    expect(
      await screen.findByText("Password must be at least 8 characters.")
    ).toBeInTheDocument();
  });

  it("reports a password mismatch keyed on the password field (backend `confirmed` rule)", async () => {
    renderWithProviders(<Register />, { entry: "/register" });

    await fillForm({
      name: "Ada",
      email: "fresh@example.test",
      password: "secret123",
      confirmation: "different123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    const password = screen.getByLabelText("Password");
    const message = await screen.findByText("Passwords do not match.");
    expect(message).toHaveAttribute("id", `${password.id}-error`);
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute(
      "aria-describedby",
      `${password.id}-error`
    );
  });

  it("renders server 422 field errors next to the matching field", async () => {
    server.use(
      http.post(REGISTER_URL, () =>
        HttpResponse.json(
          {
            message: "The given data was invalid.",
            errors: { email: ["The email has already been taken."] },
          },
          { status: 422 }
        )
      )
    );
    renderWithProviders(<Register />, { entry: "/register" });

    await fillForm({
      name: "Ada",
      email: "taken@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    const email = screen.getByLabelText("Email");
    const fieldError = await screen.findByText("The email has already been taken.");
    expect(fieldError).toHaveAttribute("id", `${email.id}-error`);
    expect(email).toHaveAttribute("aria-invalid", "true");
    // Summary alert is also present and accessible.
    expect(screen.getByTestId("register-error")).toHaveTextContent(
      "Registration failed. Please check your details and try again."
    );
  });

  it("clears a server field error once the field is edited", async () => {
    server.use(
      http.post(REGISTER_URL, () =>
        HttpResponse.json(
          {
            message: "The given data was invalid.",
            errors: { email: ["The email has already been taken."] },
          },
          { status: 422 }
        )
      )
    );
    const user = renderWithProviders(<Register />, { entry: "/register" }) && userEvent.setup();

    await fillForm({
      name: "Ada",
      email: "taken@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText("The email has already been taken.");

    await user.type(screen.getByLabelText("Email"), "x");

    expect(
      screen.queryByText("The email has already been taken.")
    ).not.toBeInTheDocument();
  });

  it("navigates home on success with no from", async () => {
    const { probe } = renderWithProviders(<Register />, { entry: "/register" });

    await fillForm({
      name: "Ada",
      email: "ada@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    await waitFor(() => expect(probe.path).toBe("/"));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("honours a safe state.from on success", async () => {
    const { probe } = renderWithProviders(<Register />, {
      entry: "/register",
      state: { from: "/cart" },
    });

    await fillForm({
      name: "Ada",
      email: "ada@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    await waitFor(() => expect(probe.path).toBe("/cart"));
    expect(testUser.email).toBe("ada@example.test");
  });

  it("keeps the state.from destination after the post-auth navigation settles", async () => {
    // Regression: the "already signed in -> navigateHome()" effect used to be
    // guarded only by `submitting`, which is cleared in the submit's `finally`.
    // When React flushed the store update after that clear, navigateHome()
    // overwrote the chosen destination. The `postAuthNavigationRan` latch is
    // what makes the destination stick.
    const { probe } = renderWithProviders(<Register />, {
      entry: "/register",
      state: { from: "/account/orders?page=2" },
    });

    await fillForm({
      name: "Ada",
      email: "ada@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    await waitFor(() => expect(probe.path).toBe("/account/orders?page=2"));
    await settle();
    expect(probe.path).toBe("/account/orders?page=2");
  });

  it("keeps a pending-action resume destination after the post-auth navigation settles", async () => {
    // Same race, reached through the resume branch: resumePendingAction() owns
    // the destination here, and nothing may overwrite it afterwards.
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 1 },
    });
    const { probe } = renderWithProviders(<Register />, {
      entry: "/register",
      state: { from: "/account" },
    });

    await fillForm({
      name: "Ada",
      email: "ada@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    await waitFor(() => expect(probe.path).toBe("/cart"));
    await settle();
    expect(probe.path).toBe("/cart");
  });

  it("shows the resume-failure notice when the pending-action replay fails", async () => {
    // A pending add-to-cart is waiting, but the replay request will 500.
    server.use(
      http.post(CART_ITEMS_URL, () => {
        callCounts.cartItems += 1;
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      })
    );
    usePendingActionStore.getState().setPendingAction({
      targetRoute: "/cart",
      method: "POST",
      url: "/cart/items",
      data: { product_id: 1, quantity: 1 },
    });
    const { probe } = renderWithProviders(<Register />, {
      entry: "/register",
      state: { from: "/account" },
    });

    expect(screen.queryByTestId("resume-notice")).not.toBeInTheDocument();

    await fillForm({
      name: "Ada",
      email: "ada@example.test",
      password: "secret123",
      confirmation: "secret123",
    });
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Create account" })
    );

    // Falls back to the safe `from` (not /cart, where the replay failed).
    await waitFor(() => expect(probe.path).toBe("/account"));

    // The coarse notice survives the navigation and is announced politely.
    const notice = await screen.findByTestId("resume-notice");
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent(
      "We couldn't complete your last action. Please try again."
    );
    // Never the raw server error.
    expect(notice).not.toHaveTextContent("boom");
  });
});
