import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./index";

describe("EmptyState", () => {
  it("renders the title and description passed via props", () => {
    render(<EmptyState title="No products found" description="Try clearing your filters." />);

    expect(screen.getByRole("heading", { name: "No products found" })).toBeInTheDocument();
    expect(screen.getByText("Try clearing your filters.")).toBeInTheDocument();
  });

  it("does not render an action button when actionLabel is omitted — content comes via props only", () => {
    render(<EmptyState title="No products found" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/clear|retry|action/i)).not.toBeInTheDocument();
  });

  it("renders an accessible action button when actionLabel is provided", () => {
    render(<EmptyState title="No products found" actionLabel="Clear filters" />);

    const button = screen.getByRole("button", { name: "Clear filters" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
  });

  it("calls onAction when the action button is clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<EmptyState title="No products found" actionLabel="Clear filters" onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});