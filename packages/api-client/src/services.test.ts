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

  it("getServiceBySlug calls the interpolated URL and unwraps data.service", async () => {
    mockGet.mockResolvedValue({ data: { service } });

    const result = await getServiceBySlug("laptop-screen-repair");

    expect(mockGet).toHaveBeenCalledWith("/services/laptop-screen-repair");
    expect(result).toEqual(service);
  });
});