import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CheckoutRoute from "./checkout";
import { renderWithProviders } from "../test/utils";

describe("checkout placeholder", () => {
  it("renders one Checkout heading and sets the page title", async () => {
    renderWithProviders(<CheckoutRoute />, { entry: "/checkout" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Checkout" })
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Checkout | TechFix"));
  });
});
