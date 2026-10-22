import { useAuthStore } from "@ecommerce/api-client";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { checkoutHandlers } from "../test/handlers-checkout";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import CheckoutRoute from "./checkout";

/**
 * The thin /checkout route (TASK B4-2a): it must render the real CheckoutView
 * behind the guard with exactly one h1 — the detailed behaviour lives in
 * CheckoutView.test.tsx, this only proves the wiring.
 */
describe("checkout route", () => {
  it("renders one Checkout heading and sets the page title", async () => {
    server.use(...checkoutHandlers);
    useAuthStore.setState({
      user: {
        id: 7,
        name: "Ada Lovelace",
        email: "ada@example.test",
        role: { id: 2, name: "Customer", slug: "customer" },
      },
      isAuthenticated: true,
      isSessionChecked: true,
    });

    renderWithProviders(<CheckoutRoute />, { entry: "/checkout" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Checkout" })
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Checkout | TechFix"));

    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isSessionChecked: false,
    });
  });
});
