import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./index";

describe("ErrorState", () => {
  it("renders a user-safe title and message passed via props", () => {
    render(<ErrorState title="Something went wrong" message="We could not load the products." />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("We could not load the products.")).toBeInTheDocument();
  });

  it("is announced as an alert to assistive tech", () => {
    render(<ErrorState title="Something went wrong" message="Try again." />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("does not render a retry button unless retryLabel and onRetry are provided", () => {
    render(<ErrorState title="Something went wrong" message="Try again." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an accessible retry button and calls onRetry on click", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ErrorState title="Something went wrong" message="Try again." retryLabel="Retry" onRetry={onRetry} />
    );

    const button = screen.getByRole("button", { name: "Retry" });
    expect(button).toHaveAttribute("type", "button");

    await user.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});