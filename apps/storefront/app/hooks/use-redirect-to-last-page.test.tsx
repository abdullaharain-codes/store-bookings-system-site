import { useEffect } from "react";
import { useNavigationType } from "react-router";
import { describe, expect, it } from "vitest";
import type { ServicesResponse } from "@ecommerce/api-client";
import { renderWithProviders } from "../test/utils";
import { useRedirectToLastPage } from "./use-redirect-to-last-page";

function emptyPage({
  total,
  currentPage,
  lastPage,
}: {
  total: number;
  currentPage: number;
  lastPage: number;
}): ServicesResponse {
  return {
    data: [],
    links: [],
    current_page: currentPage,
    first_page_url: null,
    from: null,
    last_page: lastPage,
    last_page_url: null,
    next_page_url: null,
    path: "/services",
    per_page: 12,
    prev_page_url: null,
    to: null,
    total,
  };
}

function NullRunner({ data }: { data: ServicesResponse }) {
  useRedirectToLastPage(data, (lastPage) =>
    lastPage > 1 ? `/services?page=${lastPage}` : "/services",
  );
  return null;
}

describe("useRedirectToLastPage", () => {
  it("replaces the URL with the last valid page when the page is beyond the last", () => {
    const navType = { value: "POP" as string };
    function NavigationTypeProbe() {
      const type = useNavigationType();
      useEffect(() => {
        navType.value = type;
      });
      return null;
    }

    const { probe } = renderWithProviders(
      <>
        <NullRunner data={emptyPage({ total: 13, currentPage: 99, lastPage: 2 })} />
        <NavigationTypeProbe />
      </>,
      { entry: "/services?page=99" },
    );

    expect(probe.path).toBe("/services?page=2");
    expect(navType.value).toBe("REPLACE");
  });

  it("does NOT redirect when total is 0 even on an out-of-range page", () => {
    const { probe } = renderWithProviders(
      <NullRunner data={emptyPage({ total: 0, currentPage: 2, lastPage: 1 })} />,
      { entry: "/services?page=2" },
    );

    expect(probe.path).toBe("/services?page=2");
  });

  it("does NOT redirect when the page is in range with items", () => {
    const data = {
      ...emptyPage({ total: 13, currentPage: 2, lastPage: 2 }),
      data: [{ id: 1 }],
      from: 13,
      to: 13,
    } as unknown as ServicesResponse;

    const { probe } = renderWithProviders(<NullRunner data={data} />, {
      entry: "/services?page=2",
    });

    expect(probe.path).toBe("/services?page=2");
  });
});