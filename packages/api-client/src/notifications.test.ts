import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  default: { get: mockGet, post: mockPost },
}));

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications";
import type {
  Notification,
  NotificationsResponse,
} from "./notifications";

const notification: Notification = {
  id: "3f2dc1a0-0000-4000-8000-000000000001",
  type: "App\\Notifications\\OrderStatusChanged",
  notifiable_type: "App\\Models\\User",
  notifiable_id: 7,
  data: {
    order_id: 4,
    order_number: "ORD-2026-0004",
    from: "processing",
    to: "shipped",
    message:
      "Your order ORD-2026-0004 status changed from Processing to Shipped.",
  },
  read_at: null,
  created_at: "2026-09-27T22:59:00.000000Z",
  updated_at: "2026-09-27T22:59:00.000000Z",
};

const paginator: NotificationsResponse = {
  current_page: 1,
  data: [notification],
  first_page_url: null,
  from: 1,
  last_page: 1,
  last_page_url: null,
  links: [],
  next_page_url: null,
  path: "/api/v1/notifications",
  per_page: 15,
  prev_page_url: null,
  to: 1,
  total: 1,
};

describe("notifications", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("getNotifications calls /notifications and returns the envelope", async () => {
    mockGet.mockResolvedValue({
      data: { notifications: paginator },
    });

    const result = await getNotifications();

    expect(mockGet).toHaveBeenCalledWith("/notifications", {
      params: undefined,
    });
    expect(result).toEqual({ notifications: paginator });
  });

  it("getNotifications forwards page and per_page params", async () => {
    mockGet.mockResolvedValue({ data: { notifications: paginator } });

    await getNotifications(2, 10);

    expect(mockGet).toHaveBeenCalledWith("/notifications", {
      params: { page: 2, per_page: 10 },
    });
  });

  it("markNotificationRead posts the interpolated URL and returns the notification", async () => {
    mockPost.mockResolvedValue({ data: { notification } });

    const result = await markNotificationRead(notification.id);

    expect(mockPost).toHaveBeenCalledWith(`/notifications/${notification.id}/read`);
    expect(result).toEqual({ notification });
  });

  it("markAllNotificationsRead posts to read-all and returns the marked count", async () => {
    mockPost.mockResolvedValue({ data: { marked: 3 } });

    const result = await markAllNotificationsRead();

    expect(mockPost).toHaveBeenCalledWith("/notifications/read-all");
    expect(result).toEqual({ marked: 3 });
  });
});