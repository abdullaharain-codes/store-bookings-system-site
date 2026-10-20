import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet },
}));

import { getDashboard } from "./dashboard";
import type { DashboardSummary } from "./dashboard";

const summary: DashboardSummary = {
  orders_count: 2,
  upcoming_bookings: [
    {
      id: 9,
      status: "pending",
      scheduled_slot_start: "2026-10-02T10:00:00.000000Z",
      service: { name: "Laptop Screen Repair" },
    },
  ],
  wishlist_count: 4,
};

describe("dashboard", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("getDashboard calls /dashboard and returns the top-level summary", async () => {
    mockGet.mockResolvedValue({ data: summary });

    const result = await getDashboard();

    expect(mockGet).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual(summary);
  });
});