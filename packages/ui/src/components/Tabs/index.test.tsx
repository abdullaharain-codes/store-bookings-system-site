import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./index";

const tabs = [
  { id: "details", label: "Details", content: <p>Details content</p> },
  { id: "reviews", label: "Reviews", content: <p>Reviews content</p> },
  { id: "specs", label: "Specs", content: <p>Specs content</p> },
];

describe("Tabs", () => {
  it("renders all tab labels", () => {
    render(<Tabs tabs={tabs} />);

    expect(screen.getByRole("tab", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Specs" })).toBeInTheDocument();
  });

  it("shows the first tab's panel by default and links panel to tab", () => {
    render(<Tabs tabs={tabs} aria-label="Product tabs" />);

    const detailsTab = screen.getByRole("tab", { name: "Details" });
    const tablist = screen.getByRole("tablist");
    const panel = screen.getByRole("tabpanel");

    expect(tablist).toHaveAttribute("aria-label", "Product tabs");
    expect(detailsTab).toHaveAttribute("aria-selected", "true");
    expect(detailsTab).toHaveAttribute("aria-controls", "panel-details");
    expect(panel).toHaveAccessibleName("Details");
    expect(panel).toHaveAttribute("aria-labelledby", "tab-details");
    expect(screen.getByText("Details content")).toBeInTheDocument();
    expect(screen.queryByText("Reviews content")).toBeNull();
  });

  it("switches the active tab and panel on click", async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} />);

    await user.click(screen.getByRole("tab", { name: "Reviews" }));

    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Reviews");
    expect(screen.getByText("Reviews content")).toBeInTheDocument();
    expect(screen.queryByText("Details content")).toBeNull();
  });

  it("moves selection with arrow keys, wrapping at the edges", () => {
    render(<Tabs tabs={tabs} />);
    const tablist = screen.getByRole("tablist");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveFocus();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Specs" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Specs" })).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to the first tab on Home and the last on End", () => {
    render(<Tabs tabs={tabs} />);
    const tablist = screen.getByRole("tablist");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: "Specs" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Specs");

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  });

  it("supports an uncontrolled default plus a controlled override", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Tabs tabs={tabs} activeTabId="specs" onChange={onChange} />
    );

    expect(screen.getByRole("tab", { name: "Specs" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Specs content")).toBeInTheDocument();

    rerender(<Tabs tabs={tabs} activeTabId="details" onChange={onChange} />);
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  });

  it("exposes only the active tab to the tab order (roving tabindex)", () => {
    render(<Tabs tabs={tabs} />);

    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Specs" })).toHaveAttribute("tabindex", "-1");
  });
});