import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  API_URL,
  SERVICES_URL,
  serviceDetailRequests,
} from "../../test/handlers";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import { ServiceDetail } from "./ServiceDetail";

/**
 * /service/:slug (TASK B3-3). Assertions are on roles, accessible names, real
 * hrefs, the document title/meta and the recorded requests — never on class
 * strings.
 */

describe("ServiceDetail", () => {
  it("renders the name h1, price range, duration, literal description and a booking CTA", async () => {
    renderWithProviders(<ServiceDetail slug="laptop-screen-repair" />, {
      entry: "/service/laptop-screen-repair",
    });

    await screen.findByRole("heading", {
      level: 1,
      name: "Laptop Screen Repair",
    });

    expect(screen.getByText("Rs. 2,500 – Rs. 8,000")).toBeInTheDocument();
    expect(screen.getByText("1 hr 30 min")).toBeInTheDocument();

    // The description is plain text: the markup-looking characters appear
    // verbatim and no element is created from them.
    expect(
      screen.getByText("<b>Full</b> screen replacement with a 6-month warranty."),
    ).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();

    expect(
      screen.getByRole("link", { name: "Book this service" }),
    ).toHaveAttribute("href", "/booking");
    expect(document.title).toBe("Laptop Screen Repair | TechFix");
  });

  it("breadcrumbs Home > Services > name with the name as the current, non-link item", async () => {
    renderWithProviders(<ServiceDetail slug="laptop-screen-repair" />, {
      entry: "/service/laptop-screen-repair",
    });
    await screen.findByRole("heading", {
      level: 1,
      name: "Laptop Screen Repair",
    });

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    const linkNames = within(breadcrumb)
      .getAllByRole("link")
      .map((element) => element.textContent);
    expect(linkNames).toEqual(["Home", "Services"]);
    expect(
      within(breadcrumb).getByText("Laptop Screen Repair"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("omits the description element entirely when the service has no description", async () => {
    const { container } = renderWithProviders(<ServiceDetail slug="pc-build" />, {
      entry: "/service/pc-build",
    });
    await screen.findByRole("heading", { level: 1, name: "PC Build" });

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("renders the not-found state with noindex, title and a back link", async () => {
    renderWithProviders(<ServiceDetail slug="no-such-service" />, {
      entry: "/service/no-such-service",
    });

    await screen.findByRole("heading", {
      level: 1,
      name: "Service not found",
    });
    expect(
      document.head.querySelector('meta[name="robots"][content="noindex"]'),
    ).not.toBeNull();
    expect(document.title).toBe("Service not found | TechFix");
    expect(
      screen.getByRole("link", { name: "Back to services" }),
    ).toHaveAttribute("href", "/services");
  });

  it("renders a retryable error with no raw server text and refetches only the service", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(`${SERVICES_URL}/network-setup`, () => {
        calls += 1;
        return HttpResponse.json({ message: "Server Error" }, { status: 500 });
      }),
    );

    renderWithProviders(<ServiceDetail slug="network-setup" />, {
      entry: "/service/network-setup",
    });

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("Server Error");
    expect(screen.queryByText("Server Error")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it("shows a loading skeleton with a single h1 before the service resolves", () => {
    server.use(
      http.get(`${SERVICES_URL}/data-recovery`, () => new Promise(() => {})),
    );

    renderWithProviders(<ServiceDetail slug="data-recovery" />, {
      entry: "/service/data-recovery",
    });

    expect(
      screen.getByRole("status", { name: "Loading service" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("keeps exactly one h1 in every state", async () => {
    const loading = renderWithProviders(<ServiceDetail slug="data-recovery" />, {
      entry: "/service/data-recovery",
    });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    loading.unmount();

    const success = renderWithProviders(<ServiceDetail slug="data-recovery" />, {
      entry: "/service/data-recovery",
    });
    await screen.findByRole("heading", { level: 1, name: "Data Recovery" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    success.unmount();

    renderWithProviders(<ServiceDetail slug="no-such-service" />, {
      entry: "/service/no-such-service",
    });
    await screen.findByRole("heading", {
      level: 1,
      name: "Service not found",
    });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("makes no booking or availability request", async () => {
    const bookingRequests: string[] = [];
    server.use(
      http.all(`${API_URL}/bookings`, ({ request }) => {
        bookingRequests.push(request.url);
        return HttpResponse.json({});
      }),
      http.all(`${API_URL}/services/:slug/availability`, ({ request }) => {
        bookingRequests.push(request.url);
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<ServiceDetail slug="laptop-screen-repair" />, {
      entry: "/service/laptop-screen-repair",
    });
    await screen.findByRole("heading", {
      level: 1,
      name: "Laptop Screen Repair",
    });

    expect(bookingRequests).toHaveLength(0);
    expect(serviceDetailRequests).toHaveLength(1);
  });
});