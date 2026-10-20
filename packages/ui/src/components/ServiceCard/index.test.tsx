import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Service } from "@ecommerce/api-client";
import { describe, expect, it, vi } from "vitest";
import { ServiceCard } from "./index";

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 7,
    name: "Laptop Screen Repair",
    slug: "laptop-screen-repair",
    description: "Replaces a cracked or malfunctioning laptop screen.",
    price_min: "2500",
    price_max: "8000",
    duration_minutes: 90,
    is_published: true,
    ...overrides,
  };
}

describe("ServiceCard", () => {
  it("renders name, description, and price range formatted with an en dash", () => {
    render(<ServiceCard service={makeService()} />);

    expect(screen.getByRole("heading", { name: "Laptop Screen Repair" })).toBeInTheDocument();
    expect(
      screen.getByText("Replaces a cracked or malfunctioning laptop screen.")
    ).toBeInTheDocument();
    expect(screen.getByText("Rs. 2,500 – Rs. 8,000")).toBeInTheDocument();
  });

  it("always renders both bounds of the price range, never a single bare price", () => {
    render(<ServiceCard service={makeService()} />);

    expect(screen.getByText(/Rs\. 2,500/)).toBeInTheDocument();
    expect(screen.getByText(/Rs\. 8,000/)).toBeInTheDocument();
    expect(screen.getByText(/–/)).toBeInTheDocument();
  });

  it("renders duration in human-readable form", () => {
    render(<ServiceCard service={makeService()} />);

    expect(screen.getByText("1 hr 30 min")).toBeInTheDocument();
  });

  it("renders 60 minutes as 1 hr with no trailing min", () => {
    render(<ServiceCard service={makeService({ duration_minutes: 60 })} />);

    expect(screen.getByText("1 hr")).toBeInTheDocument();
  });

  it("renders 120 minutes as 2 hrs with plural hours and no trailing min", () => {
    render(<ServiceCard service={makeService({ duration_minutes: 120 })} />);

    expect(screen.getByText("2 hrs")).toBeInTheDocument();
  });

  it("calls onBookNow when Book Service is clicked", async () => {
    const user = userEvent.setup();
    const onBookNow = vi.fn();
    render(<ServiceCard service={makeService()} onBookNow={onBookNow} />);

    await user.click(screen.getByRole("button", { name: "Book Service" }));

    expect(onBookNow).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDetails when the name/description area is clicked, without triggering onBookNow", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    const onBookNow = vi.fn();
    render(
      <ServiceCard
        service={makeService()}
        onViewDetails={onViewDetails}
        onBookNow={onBookNow}
      />
    );

    await user.click(screen.getByText("Laptop Screen Repair"));

    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onBookNow).not.toHaveBeenCalled();
  });

  it("renders LoadingSkeleton and no service content when isLoading is true", () => {
    render(<ServiceCard service={makeService()} isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Laptop Screen Repair")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book Service" })).not.toBeInTheDocument();
  });

  it("renders category badge when provided and nothing when omitted", () => {
    const { rerender } = render(<ServiceCard service={makeService()} category="Hardware" />);

    expect(screen.getByText("Hardware")).toBeInTheDocument();

    rerender(<ServiceCard service={makeService()} />);

    expect(screen.queryByText("Hardware")).not.toBeInTheDocument();
  });

  // ─── href (TASK B2d-2) ────────────────────────────────────────────────────

  describe("optional href", () => {
    it("renders the name/description area as a real anchor to href when it is given", () => {
      render(
        <ServiceCard
          service={makeService()}
          href="/service/laptop-screen-repair"
        />,
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/service/laptop-screen-repair");
      expect(
        screen.getByText("Laptop Screen Repair").closest("a"),
      ).toHaveAttribute("href", "/service/laptop-screen-repair");
    });

    it("keeps the old placeholder anchor and click handling when no href is given", async () => {
      const user = userEvent.setup();
      const onViewDetails = vi.fn();
      render(
        <ServiceCard service={makeService()} onViewDetails={onViewDetails} />,
      );

      expect(screen.getByRole("link")).toHaveAttribute("href", "#");

      await user.click(screen.getByText("Laptop Screen Repair"));
      expect(onViewDetails).toHaveBeenCalledTimes(1);
    });

    it("never intercepts modified clicks so the real href reaches the browser", () => {
      const { container } = render(
        <ServiceCard
          service={makeService()}
          href="/service/laptop-screen-repair"
          onViewDetails={vi.fn()}
        />,
      );

      const link = container.querySelector("a") as HTMLAnchorElement;
      expect(link).not.toBeNull();

      const modified: MouseEventInit[] = [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 },
      ];

      for (const init of modified) {
        let defaultPrevented: boolean | undefined;
        container.addEventListener("click", (event) => {
          defaultPrevented = event.defaultPrevented;
        });
        fireEvent.click(link, init);
        // The whole reason a real href exists: ctrl/cmd-click (open in new
        // tab), middle-click and friends must reach the browser's own link
        // handling and never be swallowed by the router.
        expect(defaultPrevented).toBe(false);
      }
    });

    it("renders no main-action link at all when neither href nor onViewDetails is given", () => {
      render(<ServiceCard service={makeService()} />);

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});