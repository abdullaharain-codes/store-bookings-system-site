import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./index";

const threeSteps = [
  { id: "service", label: "Service & Device" },
  { id: "problem", label: "Problem Details" },
  { id: "when", label: "Date & Time" },
];

describe("Stepper", () => {
  it("renders all step labels", () => {
    render(<Stepper steps={threeSteps} currentStepIndex={0} />);

    expect(screen.getByText("Service & Device")).toBeInTheDocument();
    expect(screen.getByText("Problem Details")).toBeInTheDocument();
    expect(screen.getByText("Date & Time")).toBeInTheDocument();
  });

  it("marks the current step with aria-current=\"step\"", () => {
    const { container } = render(<Stepper steps={threeSteps} currentStepIndex={1} />);

    const current = container.querySelector('[aria-current="step"]') as HTMLElement;
    expect(current).not.toBeNull();
    expect(current.textContent).toContain("Problem Details");
  });

  it("marks completed steps distinctly from upcoming steps", () => {
    const { container } = render(<Stepper steps={threeSteps} currentStepIndex={1} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    expect(items[0].querySelector("svg")).not.toBeNull();
    expect(items[1].querySelector("svg")).toBeNull();
    expect(items[2].querySelector("svg")).toBeNull();
    expect(items[2].textContent).toContain("3");
  });

  it("calls onStepClick with the completed step's index when back-nav is enabled", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <Stepper
        steps={threeSteps}
        currentStepIndex={1}
        onStepClick={onStepClick}
      />
    );

    const backButton = screen.getByRole("button", {
      name: "Step 1 of 3: Service & Device, completed",
    });
    expect(backButton).toBeEnabled();

    await user.click(backButton);

    expect(onStepClick).toHaveBeenCalledTimes(1);
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it("does not call onStepClick when disableBackNav is true (completed steps become disabled buttons)", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(
      <Stepper
        steps={threeSteps}
        currentStepIndex={1}
        onStepClick={onStepClick}
        disableBackNav
      />
    );

    const backButton = screen.getByRole("button", {
      name: "Step 1 of 3: Service & Device, completed",
    });
    expect(backButton).toBeDisabled();

    await user.click(backButton);

    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("disables completed steps when onStepClick is omitted entirely", async () => {
    const user = userEvent.setup();
    render(<Stepper steps={threeSteps} currentStepIndex={1} />);

    const backButton = screen.getByRole("button", {
      name: "Step 1 of 3: Service & Device, completed",
    });
    expect(backButton).toBeDisabled();

    await user.click(backButton);
  });

  it("never makes upcoming steps clickable, regardless of disableBackNav", () => {
    const { rerender } = render(
      <Stepper steps={threeSteps} currentStepIndex={1} onStepClick={() => undefined} />
    );

    const items = screen.getAllByRole("listitem");
    expect(items[2].querySelector("button")).toBeNull();

    rerender(
      <Stepper
        steps={threeSteps}
        currentStepIndex={1}
        onStepClick={() => undefined}
        disableBackNav
      />
    );

    const [first] = screen.getAllByRole("listitem");
    expect(first.querySelector("button")).not.toBeNull();
  });

  it("supports a variable step count without hardcoding", () => {
    const { container, rerender } = render(
      <Stepper steps={threeSteps} currentStepIndex={2} />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const sixSteps = [
      { id: "s1", label: "Service" },
      { id: "s2", label: "Device" },
      { id: "s3", label: "Problem" },
      { id: "s4", label: "Date & Time" },
      { id: "s5", label: "Address" },
      { id: "s6", label: "Confirm" },
    ];
    rerender(<Stepper steps={sixSteps} currentStepIndex={5} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(5);
  });
});