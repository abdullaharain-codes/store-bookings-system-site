import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./index";

describe("Input", () => {
  it("renders a label associated with the input via htmlFor and id", () => {
    render(<Input label="Email address" />);

    const label = screen.getByText("Email address");
    const input = screen.getByLabelText("Email address");

    expect(label).toHaveAttribute("for", "input-email-address");
    expect(input).toHaveAttribute("id", "input-email-address");
    expect(label).toHaveAttribute("for", input.id);
  });

  it("derives the input id from the label when no id is supplied", () => {
    render(<Input label="Phone number" />);

    expect(screen.getByLabelText("Phone number")).toHaveAttribute(
      "id",
      "input-phone-number"
    );
  });

  it("uses an explicit id when one is provided", () => {
    render(<Input label="Email address" id="contact-email" />);

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("id", "contact-email");
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("forwards native input attributes such as type, placeholder and name", () => {
    render(
      <Input
        label="Password"
        type="password"
        name="password"
        placeholder="Enter your password"
        autoComplete="current-password"
      />
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("name", "password");
    expect(input).toHaveAttribute("placeholder", "Enter your password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
  });

  it("marks the control as disabled", () => {
    render(<Input label="Email address" disabled />);

    expect(screen.getByLabelText("Email address")).toBeDisabled();
  });

  it("forwards a controlled value", () => {
    render(<Input label="Email address" value="ada@example.test" onChange={() => {}} />);

    expect(screen.getByLabelText("Email address")).toHaveValue("ada@example.test");
  });

  it("emits the typed value through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Email address" onChange={onChange} />);

    await user.type(screen.getByLabelText("Email address"), "a");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]?.target?.value).toBe("a");
  });

  it("stays in sync when the value is managed by the caller", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [value, setValue] = useState("");
      return (
        <Input
          label="Email address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Controlled />);

    await user.type(screen.getByLabelText("Email address"), "ada");

    expect(screen.getByLabelText("Email address")).toHaveValue("ada");
  });

  it("does not mark the control invalid when there is no error", () => {
    render(<Input label="Email address" />);

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("marks the control invalid and points at the rendered error message", () => {
    render(<Input label="Email address" error="Enter a valid email address." />);

    const input = screen.getByLabelText("Email address");
    const message = screen.getByRole("alert");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", message.id);
    expect(message).toHaveTextContent("Enter a valid email address.");
    expect(message.id).toBe("input-email-address-error");
  });

  it("associates the error message with a custom id as well", () => {
    render(
      <Input label="Email address" id="contact-email" error="Required field." />
    );

    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("aria-describedby", "contact-email-error");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "contact-email-error");
  });

  it("removes the error message and the invalid state once the error clears", () => {
    const { rerender } = render(
      <Input label="Email address" error="Enter a valid email address." />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<Input label="Email address" />);

    const input = screen.getByLabelText("Email address");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("renders the required attribute on the control", () => {
    render(<Input label="Email address" required />);

    expect(screen.getByLabelText("Email address")).toBeRequired();
  });

  it("labels a required field with text rather than a colour-only cue", () => {
    render(<Input label="Email address" required error="Enter a valid email address." />);

    // The error text is programmatic, so the requirement is never conveyed by
    // the red border alone.
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("applies a focus ring class so keyboard focus is visible", () => {
    render(<Input label="Email address" />);

    const input = screen.getByLabelText("Email address");
    expect(input.className).toContain("focus:ring-1");
    expect(input.className).toContain("focus:border-[var(--color-brand-accent)]");
  });

  it("switches the border to the error token when an error is present", () => {
    render(<Input label="Email address" error="Required field." />);

    const input = screen.getByLabelText("Email address");
    expect(input.className).toContain("border-[var(--color-status-error)]");
    expect(input.className).toContain("focus:ring-[var(--color-status-error)]");
  });

  it("uses the default border token when there is no error", () => {
    render(<Input label="Email address" />);

    expect(screen.getByLabelText("Email address").className).toContain(
      "border-[var(--color-border-default)]"
    );
  });

  it("merges a caller supplied className", () => {
    render(<Input label="Email address" className="max-w-xs" />);

    const input = screen.getByLabelText("Email address");
    expect(input.className).toContain("max-w-xs");
    expect(input.className).toContain("w-full");
  });

  it("forwards a ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input label="Email address" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(screen.getByLabelText("Email address"));
  });

  it("supports focus management through the forwarded ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input label="Email address" ref={ref} />);

    ref.current?.focus();

    expect(ref.current).toHaveFocus();
  });

  it("is exposed to assistive technology as a textbox", () => {
    render(<Input label="Email address" type="email" />);

    expect(screen.getByRole("textbox")).toBe(screen.getByLabelText("Email address"));
  });

  it("does not render an error element when no error prop is given", () => {
    render(<Input label="Email address" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
