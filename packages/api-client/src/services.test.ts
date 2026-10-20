import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet },
}));

import { getServiceBySlug, getServices } from "./services";
import type { Service } from "./services";

const service: Service = {
  id: 7,
  name: "Laptop Screen Repair",
  slug: "laptop-screen-repair",
  description: "Replace a cracked laptop screen.",
  price_min: "2500.00",
  price_max: "8000.00",
  duration_minutes: 90,
  is_published: true,
};

describe("services", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("getServices calls /services without params when page is omitted", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    await getServices();

    expect(mockGet).toHaveBeenCalledWith("/services", {
      params: undefined,
    });
  });

  it("getServices passes page as a query param", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    await getServices(2);

    expect(mockGet).toHaveBeenCalledWith("/services", {
      params: { page: 2 },
    });
  });

  it("getServices sends per_page alone when only perPage is given", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    await getServices(undefined, 12);

    expect(mockGet).toHaveBeenCalledWith("/services", {
      params: { per_page: 12 },
    });
  });

  it("getServices sends page and per_page together", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    await getServices(2, 12);

    expect(mockGet).toHaveBeenCalledWith("/services", {
      params: { page: 2, per_page: 12 },
    });
  });

  it("getServices clamps perPage into [1, 48] the same way as getProducts", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    await getServices(undefined, 0);
    expect(mockGet).toHaveBeenLastCalledWith("/services", {
      params: { per_page: 1 },
    });

    mockGet.mockClear();
    await getServices(undefined, 100);
    expect(mockGet).toHaveBeenLastCalledWith("/services", {
      params: { per_page: 48 },
    });

    mockGet.mockClear();
    await getServices(undefined, 12.7);
    expect(mockGet).toHaveBeenLastCalledWith("/services", {
      params: { per_page: 13 },
    });
  });

  it("getServices reports its OWN name, not getProducts, when perPage is non-finite", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    const error = await getServices(undefined, Number.NaN).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toContain("getServices");
    expect((error as Error).message).not.toContain("getProducts");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("getServiceBySlug calls the interpolated URL and unwraps data.service", async () => {
    mockGet.mockResolvedValue({ data: { service } });

    const result = await getServiceBySlug("laptop-screen-repair");

    expect(mockGet).toHaveBeenCalledWith("/services/laptop-screen-repair");
    expect(result).toEqual(service);
  });
});