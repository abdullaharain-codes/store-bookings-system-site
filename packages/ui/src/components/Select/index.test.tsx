import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./index";

const options = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
];

describe("Select", () => {
  it("renders the label programmatically associated with the select", () => {
    render(<Select label="Device Type" options={options} />);

    const select = screen.getByLabelText("Device Type") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.id).toBe("select-device-type");
  });

  it("renders all options", () => {
    render(<Select label="Device Type" options={options} />);

    const optionElements = screen.getAllByRole("option");
    expect(optionElements).toHaveLength(3);
    expect(optionElements.map((element) => element.textContent)).toEqual([
      "Laptop",
      "Desktop",
      "Tablet",
    ]);
  });

  it("renders a disabled placeholder option when placeholder is provided", () => {
    render(
      <Select
        label="Device Type"
        options={options}
        placeholder="Choose a device..."
      />
    );

    const placeholderOption = screen.getByRole("option", {
      name: "Choose a device...",
    });
    expect(placeholderOption).toBeDisabled();
  });

  it("calls onChange with the new value on selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Device Type" options={options} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Device Type"), "desktop");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("desktop");
  });

  it("renders the error message linked via aria-describedby", () => {
    render(
      <Select label="Device Type" options={options} error="Please choose a device" />
    );

    const select = screen.getByLabelText("Device Type");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Please choose a device");
    expect(alert.id).toBe("select-device-type-error");
    expect(select).toHaveAttribute("aria-describedby", "select-device-type-error");
    expect(select).toHaveAttribute("aria-invalid", "true");
  });

  it("does not fire onChange when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        label="Device Type"
        options={options}
        value="laptop"
        onChange={onChange}
        disabled
      />
    );

    const select = screen.getByLabelText("Device Type") as HTMLSelectElement;
    expect(select).toBeDisabled();

    await user.selectOptions(select, "desktop");

    expect(onChange).not.toHaveBeenCalled();
    expect(select.value).toBe("laptop");
  });

  it("round-trips as a controlled component in the real-page pattern", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [value, setValue] = useState("laptop");
      return (
        <Select
          label="Device Type"
          options={options}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }

    render(<Harness />);
    const select = screen.getByLabelText("Device Type") as HTMLSelectElement;
    expect(select.value).toBe("laptop");

    await user.selectOptions(select, "desktop");

    expect(select.value).toBe("desktop");
  });

  it("warns in development when a controlled value matches no option", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <Select label="Device Type" options={options} value="phones" onChange={() => undefined} />
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("matches no rendered option");

    warn.mockRestore();
  });

  it("warns when a controlled value=\"\" is passed with no placeholder", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<Select label="Device Type" options={options} value="" onChange={() => undefined} />);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("matches no rendered option");

    warn.mockRestore();
  });

  it("does not warn when the controlled value resolves to an option or the placeholder", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<Select label="Device Type" options={options} value="laptop" onChange={() => undefined} />);
    render(
      <Select
        label="Device Type"
        options={options}
        value=""
        onChange={() => undefined}
        placeholder="Choose a device..."
      />
    );
    render(<Select label="Device Type" options={options} onChange={() => undefined} />);

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});