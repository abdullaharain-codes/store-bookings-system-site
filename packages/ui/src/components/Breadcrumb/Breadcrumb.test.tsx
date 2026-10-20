import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumb } from "./index";

function renderBreadcrumb(
  props: Partial<Parameters<typeof Breadcrumb>[0]> = {}
) {
  const onNavigate = props.onNavigate ?? vi.fn();
  const result = render(
    <Breadcrumb
      items={[{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }, { label: "Laptops" }]}
      onNavigate={onNavigate}
      {...props}
    />
  );
  return { ...result, onNavigate };
}

describe("Breadcrumb", () => {
  it("is a nav with a Breadcrumb label containing an ordered list", () => {
    renderBreadcrumb();

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelector("ol")).toBeInTheDocument();
    expect(nav.querySelectorAll("li")).toHaveLength(3);
  });

  it("honours a custom aria label", () => {
    renderBreadcrumb({ ariaLabel: "Where you are" });
    expect(
      screen.getByRole("navigation", { name: "Where you are" })
    ).toBeInTheDocument();
  });

  it("renders every item except the last as a real link", () => {
    renderBreadcrumb();

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/shop"
    );
    // The current page is never a link.
    expect(screen.queryByRole("link", { name: "Laptops" })).not.toBeInTheDocument();
    expect(screen.getByText("Laptops")).toBeInTheDocument();
  });

  it("marks the last item with aria-current and not a link even when a href is supplied", () => {
    renderBreadcrumb({ items: [{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }] });

    const current = screen.getByText("Shop");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("calls onNavigate and prevents navigation on a plain left click of a link", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderBreadcrumb();

    await user.click(screen.getByRole("link", { name: "Home" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("/");
    // The anchor never moved the document to "/" via its href.
    expect(window.location.pathname).toBe("/");
  });

  it("leaves modified clicks on links to the browser", () => {
    const { onNavigate } = renderBreadcrumb();

    fireEvent.click(screen.getByRole("link", { name: "Shop" }), {
      ctrlKey: true,
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders only the current item for a single-item trail", () => {
    renderBreadcrumb({ items: [{ label: "Home" }] });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Home")).toHaveAttribute("aria-current", "page");
  });

  it("renders nothing for an empty trail", () => {
    const { container } = renderBreadcrumb({ items: [] });
    expect(container.firstChild).toBeNull();
  });
});