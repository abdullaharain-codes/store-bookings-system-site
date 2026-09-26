import { render, screen } from "@testing-library/react";
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

  it("calls onBookNow when Book Now is clicked", async () => {
    const user = userEvent.setup();
    const onBookNow = vi.fn();
    render(<ServiceCard service={makeService()} onBookNow={onBookNow} />);

    await user.click(screen.getByRole("button", { name: "Book Now" }));

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
    expect(screen.queryByRole("button", { name: "Book Now" })).not.toBeInTheDocument();
  });
});