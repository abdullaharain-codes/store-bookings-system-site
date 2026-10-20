import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/utils";
import { DetailNotFound } from "./DetailNotFound";

/**
 * Shared not-found block (TASK B3-3). Product and service detail pages both
 * render it, so its contract is asserted once here: a breadcrumb, exactly one
 * h1, the message and a real back link.
 */

const BREADCRUMB = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
];

describe("DetailNotFound", () => {
  it("renders the breadcrumb, exactly one h1, the message and the back link", () => {
    renderWithProviders(
      <DetailNotFound
        title="Service not found"
        message="This service does not exist or is no longer available."
        breadcrumbItems={BREADCRUMB}
        backHref="/services"
        backLabel="Back to services"
      />,
      { entry: "/service/missing" },
    );

    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Service not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This service does not exist or is no longer available."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to services" }),
    ).toHaveAttribute("href", "/services");
  });

  it("routes a plain breadcrumb click through onNavigate", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(
      <DetailNotFound
        title="Service not found"
        message="Message."
        breadcrumbItems={BREADCRUMB}
        backHref="/services"
        backLabel="Back to services"
        onNavigate={onNavigate}
      />,
      { entry: "/service/missing" },
    );

    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(onNavigate).toHaveBeenCalledWith("/");
  });
});
