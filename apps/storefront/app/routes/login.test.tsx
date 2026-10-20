import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore, usePendingActionStore } from "@ecommerce/api-client";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_URL, callCounts, session, testUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Login from "./login";

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

function renderLogin(options?: { entry?: string; state?: unknown }) {
  return renderWithProviders(<Login />, options);
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
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

describe("Login page", () => {
  beforeEach(() => {
    resetAuthStore();
    usePendingActionStore.getState().clearPendingAction();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one h1 and labeled email/password fields with autocomplete hints", () => {
    renderLogin();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });

  it("has an accessible name on every input", () => {
    renderLogin();

    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    // Passwords are not exposed as textbox by role; assert via label instead.
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows validation and does not call the API on an empty submit", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Please enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Please enter your password.")).toBeInTheDocument();
    expect(callCounts.login).toBe(0);
  });

  it("rejects a malformed email without calling the API", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Please enter a valid email address.")
    ).toBeInTheDocument();
    expect(callCounts.login).toBe(0);
  });

  it("shows an accessible alert on wrong credentials and clears the password", async () => {
    renderLogin();

    await fillAndSubmit("wrong@example.test", "secret123");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    // The email is kept so the user can correct just the password.
    expect(screen.getByLabelText("Email")).toHaveValue("wrong@example.test");
  });

  it("shows the login rate-limit message on a 429", async () => {
    server.use(
      http.post(LOGIN_URL, () =>
        HttpResponse.json({ message: "Too Many Attempts." }, { status: 429 })
      )
    );
    renderLogin();

    await fillAndSubmit(testUser.email, "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many login attempts. Please wait a moment and try again."
    );
  });

  it("shows the generic message on a network error", async () => {
    server.use(http.post(LOGIN_URL, () => HttpResponse.error()));
    renderLogin();

    await fillAndSubmit(testUser.email, "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again."
    );
  });

  it("lands on / after a successful login with no pending action and no from", async () => {
    const { probe } = renderLogin({ entry: "/login" });

    await fillAndSubmit(testUser.email, "secret123");

    await waitFor(() => expect(probe.path).toBe("/"));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("honours a safe state.from after login", async () => {
    const { probe } = renderLogin({
      entry: "/login",
      state: { from: "/account/orders?page=2" },
    });

    await fillAndSubmit(testUser.email, "secret123");

    await waitFor(() => expect(probe.path).toBe("/account/orders?page=2"));
  });

  it("keeps the state.from destination after the post-auth navigation settles", async () => {
    // Regression: the "already signed in -> navigateHome()" effect used to be
    // guarded only by `submitting`, which is cleared in the submit's `finally`.
    // When React flushed the store update after that clear, navigateHome()
    // overwrote the chosen destination. The `postAuthNavigationRan` latch is
    // what makes the destination stick.
    const { probe } = renderLogin({
      entry: "/login",
      state: { from: "/account/orders?page=2" },
    });

    await fillAndSubmit(testUser.email, "secret123");

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
    const { probe } = renderLogin({
      entry: "/login",
      state: { from: "/account" },
    });

    await fillAndSubmit(testUser.email, "secret123");

    await waitFor(() => expect(probe.path).toBe("/cart"));
    await settle();
    expect(probe.path).toBe("/cart");
  });

  it("never navigates to an unsafe state.from (open-redirect guard)", async () => {
    const { probe } = renderLogin({
      entry: "/login",
      state: { from: "https://evil.test/steal" },
    });

    await fillAndSubmit(testUser.email, "secret123");

    await waitFor(() => expect(probe.path).toBe("/"));
    expect(probe.path).not.toContain("evil.test");
  });

  it("redirects an already-authenticated visitor away from /login", async () => {
    useAuthStore.setState({ isSessionChecked: true, isAuthenticated: true });
    const { probe } = renderLogin({ entry: "/login" });

    await waitFor(() => expect(probe.path).toBe("/"));
  });

  it("does not submit twice while the first request is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(LOGIN_URL, async () => {
        callCounts.login += 1;
        await gate;
        session.start();
        return HttpResponse.json({ user: testUser });
      })
    );

    const user = userEvent.setup();
    const { probe } = renderLogin({ entry: "/login" });
    await user.type(screen.getByLabelText("Email"), testUser.email);
    await user.type(screen.getByLabelText("Password"), "secret123");

    const button = screen.getByRole("button", { name: "Sign in" });
    const form = button.closest("form") as HTMLFormElement;

    fireEvent.click(button);
    // The request must have reached the handler before the duplicate submits,
    // otherwise the assertion would race the network.
    await waitFor(() => expect(callCounts.login).toBe(1));

    fireEvent.click(button);
    fireEvent.submit(form);

    expect(callCounts.login).toBe(1);

    release();
    await waitFor(() => expect(probe.path).toBe("/"));
  });
});
