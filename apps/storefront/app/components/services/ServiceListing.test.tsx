import { useEffect } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useNavigationType } from "react-router";
import { describe, expect, it } from "vitest";
import type { Service } from "@ecommerce/api-client";
import {
  SERVICES_URL,
  servicesListRequests,
  setServicesListSource,
  testServices,
} from "../../test/handlers";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import { ServiceListing } from "./ServiceListing";

/**
 * /services (TASK B3-3). Assertions are on roles, accessible names, real hrefs
 * and the recorded requests — never on class strings.
 */

/** A pool larger than one page so pagination can be driven. */
function manyServices(count: number): Service[] {
  return Array.from({ length: count }, (_, index) => {
    const base = testServices[index % testServices.length];
    return {
      ...base,
      id: 1000 + index,
      slug: `service-${index}`,
      name: `Service ${index + 1}`,
    };
  });
}

describe("ServiceListing", () => {
  it("renders one card per service, in API order, with a price range and a real details link", async () => {
    setServicesListSource(testServices);
    renderWithProviders(<ServiceListing />, { entry: "/services" });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Services" }),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual(testServices.map((service) => service.name));

    expect(
      screen.getByText("Laptop Screen Repair").closest("a"),
    ).toHaveAttribute("href", "/service/laptop-screen-repair");
    expect(screen.getByText("Rs. 2,500 – Rs. 8,000")).toBeInTheDocument();
    expect(screen.getByText("1 hr 30 min")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Book Service" }),
    ).toHaveLength(4);
  });

  it("paginates through ?page= and sends page + per_page to the API", async () => {
    const user = userEvent.setup();
    setServicesListSource(manyServices(13));
    const { probe } = renderWithProviders(<ServiceListing />, {
      entry: "/services",
    });

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(12);
    expect(servicesListRequests[0].params.get("per_page")).toBe("12");
    expect(servicesListRequests[0].params.get("page")).toBeNull();

    await user.click(screen.getByRole("link", { name: "Page 2" }));

    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1),
    );
    expect(probe.path).toBe("/services?page=2");
    expect(servicesListRequests.at(-1)?.params.get("page")).toBe("2");
  });

  it("shows a loading skeleton and the h1 before the services resolve", () => {
    server.use(http.get(SERVICES_URL, () => new Promise(() => {})));

    renderWithProviders(<ServiceListing />, { entry: "/services" });

    expect(
      screen.getByRole("status", { name: "Loading services" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Services" }),
    ).toBeInTheDocument();
  });

  it("shows a retryable error and refetches only the services request", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(SERVICES_URL, () => {
        calls += 1;
        return HttpResponse.json({ message: "Server Error" }, { status: 500 });
      }),
    );

    renderWithProviders(<ServiceListing />, { entry: "/services" });

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("Server Error");
    expect(
      screen.getByRole("heading", { level: 1, name: "Services" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it("shows a friendly empty state when there are no services", async () => {
    setServicesListSource([]);
    renderWithProviders(<ServiceListing />, { entry: "/services" });

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

    expect(
      screen.getByRole("heading", { level: 1, name: "Services" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "No services yet" }),
    ).toBeInTheDocument();
  });

  it("replaces an out-of-range ?page= with the last valid page, exactly once", async () => {
    const navType = { value: "POP" as string };
    function NavigationTypeProbe() {
      const type = useNavigationType();
      useEffect(() => {
        navType.value = type;
      });
      return null;
    }

    setServicesListSource(manyServices(13));
    const { probe } = renderWithProviders(
      <>
        <ServiceListing />
        <NavigationTypeProbe />
      </>,
      { entry: "/services?page=99" },
    );

    await waitFor(() => expect(probe.path).toBe("/services?page=2"));

    expect(navType.value).toBe("REPLACE");
    expect(servicesListRequests).toHaveLength(2);
    expect(servicesListRequests[0].params.get("page")).toBe("99");
    expect(servicesListRequests[1].params.get("page")).toBe("2");
    expect(
      screen.getByRole("heading", { level: 1, name: "Services" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state with NO redirect when the catalogue has zero services", async () => {
    setServicesListSource([]);
    const { probe } = renderWithProviders(<ServiceListing />, {
      entry: "/services?page=2",
    });

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

    expect(
      screen.getByRole("heading", { level: 2, name: "No services yet" }),
    ).toBeInTheDocument();
    expect(probe.path).toBe("/services?page=2");
    expect(servicesListRequests).toHaveLength(1);
  });
});
