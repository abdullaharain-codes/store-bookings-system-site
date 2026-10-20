import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";
import { renderWithProviders } from "../test/utils";

describe("SiteFooter", () => {
  it("is a contentinfo landmark", () => {
    renderWithProviders(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("shows the configured brand name and tagline", () => {
    renderWithProviders(<SiteFooter />);

    expect(screen.getByRole("link", { name: "TechFix" })).toHaveAttribute("href", "/");
    expect(
      screen.getByText(/expert it products, repair and support/i)
    ).toBeInTheDocument();
  });

  it("renders a legal line with a real copyright sign", () => {
    renderWithProviders(<SiteFooter />);

    expect(screen.getByText(/©/)).toBeInTheDocument();
  });

  it("ships no dead links while the policy pages do not exist", () => {
    renderWithProviders(<SiteFooter />);

    // The reference footer lists Privacy / Terms / Contact / Warranty /
    // Return, but none of those routes exist yet, so none may be linked.
    for (const label of [/privacy/i, /terms/i, /warranty/i, /return policy/i]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("omits the contact block when no contact details are configured", () => {
    renderWithProviders(<SiteFooter />);

    expect(screen.queryByText(/support@example/i)).not.toBeInTheDocument();
  });
});
