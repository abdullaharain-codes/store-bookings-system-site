import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/utils";
import AccountIndex from "./account._index";

describe("account hub", () => {
  it("renders one h1 and links to the orders list and the wishlist", async () => {
    renderWithProviders(<AccountIndex />, { entry: "/account" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "My account" })
    ).toBeInTheDocument();
    expect(document.querySelectorAll("h1").length).toBe(1);

    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/account/orders",
    );
    expect(screen.getByRole("link", { name: "Wishlist" })).toHaveAttribute(
      "href",
      "/wishlist",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/account/profile",
    );
    expect(
      screen.getByRole("link", { name: "Saved addresses" }),
    ).toHaveAttribute("href", "/account/addresses");
  });

  it("renders NO link to a page that does not exist yet (profile / addresses) is no longer true — they exist in B4-3b", async () => {
    renderWithProviders(<AccountIndex />, { entry: "/account" });

    const hrefs = Array.from(document.querySelectorAll("a")).map(
      (anchor) => anchor.getAttribute("href"),
    );
    expect(hrefs).toContain("/account/profile");
    expect(hrefs).toContain("/account/addresses");
  });
});
