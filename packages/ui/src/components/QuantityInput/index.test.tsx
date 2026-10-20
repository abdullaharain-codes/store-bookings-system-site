import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { QuantityInput } from "./index";

/**
 * QuantityInput holds a STRING draft (so the field can be cleared and retyped),
 * commits a clamped number on blur and on +/- , and treats max < min as min.
 * These tests pin that contract directly; ProductDetail's page tests pin the
 * same behaviour through the extracted control so nothing regresses.
 */

/** Controlled harness, mirroring how a page owns the committed value. */
function Harness(props: {
  initial?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange?: (next: number) => void;
}) {
  const [value, setValue] = useState(props.initial ?? 1);
  return (
    <QuantityInput
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      min={props.min}
      max={props.max}
      disabled={props.disabled}
      id="qty"
    />
  );
}

const input = () => screen.getByLabelText("Quantity");

describe("QuantityInput", () => {
  it("keeps a string draft while typing and does not snap mid-edit", async () => {
    const user = userEvent.setup();
    render(<Harness max={4} />);

    await user.clear(input());
    expect(input()).toHaveValue(null);

    await user.type(input(), "3");
    expect(input()).toHaveValue(3);
  });

  it("clamps an over-max draft to max on blur", () => {
    render(<Harness max={4} />);

    fireEvent.change(input(), { target: { value: "999" } });
    expect(input()).toHaveValue(999);
    fireEvent.blur(input());
    expect(input()).toHaveValue(4);
  });

  it("resets an empty/invalid draft to min on blur", () => {
    render(<Harness max={4} />);

    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.blur(input());
    expect(input()).toHaveValue(1);
  });

  it("clamps +/- to [min, max]", async () => {
    const user = userEvent.setup();
    render(<Harness max={2} />);

    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(input()).toHaveValue(1);

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(input()).toHaveValue(2);
  });

  it("commits the clamped value through onChange on blur", () => {
    const onChange = vi.fn();
    render(<Harness max={10} onChange={onChange} />);

    fireEvent.change(input(), { target: { value: "7" } });
    fireEvent.blur(input());
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("commits through onChange on +/-", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness max={10} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("honours the disabled prop on the field and both buttons", () => {
    render(<Harness max={4} disabled />);

    expect(input()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });

  it("treats max smaller than min as min (so an empty stock never allows 0)", () => {
    render(<Harness min={1} max={0} />);

    fireEvent.change(input(), { target: { value: "5" } });
    fireEvent.blur(input());
    expect(input()).toHaveValue(1);
  });

  it("resyncs the draft when the parent commits a new value (server reset)", () => {
    const { rerender } = render(<QuantityInput value={5} onChange={() => {}} max={10} id="qty" />);
    expect(input()).toHaveValue(5);

    rerender(<QuantityInput value={2} onChange={() => {}} max={10} id="qty" />);
    expect(input()).toHaveValue(2);
  });

  it("uses the default label Quantity and a custom label when given", () => {
    const { rerender } = render(<QuantityInput value={1} onChange={() => {}} id="qty" />);
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();

    rerender(<QuantityInput value={1} onChange={() => {}} id="qty" label="Amount" />);
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });
});
