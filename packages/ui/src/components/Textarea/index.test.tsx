import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Textarea } from "./index";

describe("Textarea", () => {
  it("renders the label programmatically associated with the textarea", () => {
    render(<Textarea label="Problem description" />);

    const textarea = screen.getByLabelText("Problem description") as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.id).toBe("textarea-problem-description");
  });

  it("defaults to 4 rows and honors a custom rows prop", () => {
    const { rerender } = render(<Textarea label="Problem description" />);
    expect(screen.getByLabelText("Problem description")).toHaveAttribute("rows", "4");

    rerender(<Textarea label="Problem description" rows={6} />);
    expect(screen.getByLabelText("Problem description")).toHaveAttribute("rows", "6");
  });

  it("calls onChange with the typed value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea label="Problem description" onChange={onChange} />);

    await user.type(screen.getByLabelText("Problem description"), "Screen cracked");

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)[0].target.value).toBe("Screen cracked");
  });

  it("renders the error message linked via aria-describedby", () => {
    render(
      <Textarea label="Problem description" error="Please describe the issue" />
    );

    const textarea = screen.getByLabelText("Problem description");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Please describe the issue");
    expect(alert.id).toBe("textarea-problem-description-error");
    expect(textarea).toHaveAttribute("aria-describedby", "textarea-problem-description-error");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });

  it("does not accept input when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea label="Problem description" value="" onChange={onChange} disabled />);

    const textarea = screen.getByLabelText("Problem description") as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();

    await user.type(textarea, "no");

    expect(onChange).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });
});