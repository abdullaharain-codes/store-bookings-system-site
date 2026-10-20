import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Modal } from "./index";

function ControlledModal({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open modal
      </button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} aria-label="Test dialog">
        {children}
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("moves focus into the modal container when it opens", async () => {
    const user = userEvent.setup();
    render(
      <ControlledModal>
        <button type="button">First</button>
        <button type="button">Second</button>
      </ControlledModal>
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeVisible();
    expect(dialog.firstElementChild).toHaveFocus();
  });

  it("traps Tab: from the last focusable element it wraps to the first", async () => {
    const user = userEvent.setup();
    render(
      <ControlledModal>
        <button type="button">First</button>
        <button type="button">Second</button>
      </ControlledModal>
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));

    const close = screen.getByRole("button", { name: "Close modal" });
    const second = screen.getByRole("button", { name: "Second" });

    second.focus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it("traps Shift+Tab: from the first focusable element it wraps to the last", async () => {
    const user = userEvent.setup();
    render(
      <ControlledModal>
        <button type="button">First</button>
        <button type="button">Second</button>
      </ControlledModal>
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));

    const close = screen.getByRole("button", { name: "Close modal" });
    const second = screen.getByRole("button", { name: "Second" });

    close.focus();
    await user.tab({ shift: true });
    expect(second).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <ControlledModal>
        <button type="button">Inside</button>
      </ControlledModal>
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on overlay click", async () => {
    const user = userEvent.setup();
    render(
      <ControlledModal>
        <button type="button">Inside</button>
      </ControlledModal>
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("dialog", { name: "Test dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the triggering element on close", async () => {
    const user = userEvent.setup();
    render(
      <ControlledModal>
        <button type="button">Inside</button>
      </ControlledModal>
    );

    const trigger = screen.getByRole("button", { name: "Open modal" });
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Close modal" }));

    expect(trigger).toHaveFocus();
  });
});