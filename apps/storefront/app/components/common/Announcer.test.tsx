import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnnouncerProvider, useAnnounce } from "./Announcer";

function Emitter({ message = "Saved" }: { message?: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message)}>
      emit
    </button>
  );
}

function BareConsumer() {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce("ignored")}>
      bare
    </button>
  );
}

describe("Announcer", () => {
  it("always mounts one polite status region, even before any announcement", () => {
    render(
      <AnnouncerProvider>
        <Emitter />
      </AnnouncerProvider>
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");
  });

  it("announce() updates the live region", async () => {
    render(
      <AnnouncerProvider>
        <Emitter message="Added to cart." />
      </AnnouncerProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "emit" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Added to cart.")
    );
  });

  it("re-announces the SAME text (clears before setting again)", async () => {
    render(
      <AnnouncerProvider>
        <Emitter message="Hello" />
      </AnnouncerProvider>
    );
    const button = screen.getByRole("button", { name: "emit" });

    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Hello"));

    fireEvent.click(button);
    // Cleared synchronously, then set on the next tick — the region is never
    // left holding the same text, which is what makes it re-announce.
    expect(screen.getByRole("status").textContent).toBe("");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Hello"));
  });

  it("useAnnounce() outside a provider is a safe no-op", () => {
    render(<BareConsumer />);

    const button = screen.getByRole("button", { name: "bare" });
    expect(() => fireEvent.click(button)).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
