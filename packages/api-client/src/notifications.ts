/**
 * Typed wrappers around the notification endpoints (Laravel API v1).
 *
 * Response shapes mirror App\Http\Controllers\Api\V1\NotificationController
 * exactly — verified against the controller rather than guessed:
 * - GET    /notifications                 -> { notifications: Paginator<Notification> } (default per_page 15)
 * - POST   /notifications/{id}/read       -> { notification: Notification }
 * - POST   /notifications/read-all        -> { marked: number }
 *
 * All three are auth:sanctum. The list has no {id} at all; the single-mark
 * {id} is a UUID string (Laravel's notifications PK) resolved by
 * NotificationService, so a foreign-owned notification 404s byte-identically
 * to a missing one (never 403, never the data). Marking is idempotent — an
 * already-read notification is simply returned. The serialized entity is
 * Laravel's DatabaseNotification (id/type/notifiable/data/read_at/timestamps);
 * data carries the click-through id for the app's producers
 * (order_id/booking_id) plus a human message.
 */
import apiClient from "./api-client";
import type { Paginator } from "./catalog";

// ─── Entity types (serialized DatabaseNotification JSON) ────────────────────

/**
 * Payload of App\Notifications\OrderStatusChanged: source + destination
 * statuses and the order to click through to.
 */
export interface OrderStatusNotificationData {
  order_id: number;
  order_number: string;
  from: string;
  to: string;
  message: string;
}

/**
 * Payload of App\Notifications\BookingStatusChanged: source + destination
 * statuses and the booking to click through to.
 */
export interface BookingStatusNotificationData {
  booking_id: number;
  service_name: string | null;
  from: string;
  to: string;
  message: string;
}

/**
 * Payload of App\Notifications\BookingFinalPriceEntered: the confirmed
 * amount (decimal:2, i.e. a "12500.00" string) plus the booking id.
 */
export interface BookingFinalPriceNotificationData {
  booking_id: number;
  service_name: string | null;
  final_price: string;
  message: string;
}

/**
 * The JSON `data` column of a notification row. The app's three producers
 * emit exactly one of the shapes above (discriminate on `type`); the
 * notifications table itself can hold arbitrary JSON, so treat unknown keys
 * as absent.
 */
export type NotificationData =
  | OrderStatusNotificationData
  | BookingStatusNotificationData
  | BookingFinalPriceNotificationData;

export interface Notification {
  /** Primary key — a UUID string, not an auto-increment number. */
  id: string;
  /** Notification class name, e.g. "App\\Notifications\\OrderStatusChanged". */
  type: string;
  notifiable_type: string;
  notifiable_id: number;
  /** Type-specific payload; always includes a human-readable message. */
  data: NotificationData;
  /** ISO-8601 timestamp when the notification was marked read, else null. */
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Envelope types ─────────────────────────────────────────────────────────

export type NotificationsResponse = Paginator<Notification>;

export interface NotificationReadResponse {
  notification: Notification;
}

export interface MarkAllNotificationsResponse {
  marked: number;
}

// ─── Endpoint wrappers ──────────────────────────────────────────────────────

/** The authenticated user's own notifications, most-recent-first. Default page size is 15. */
export async function getNotifications(
  page?: number,
  perPage?: number,
): Promise<{ notifications: NotificationsResponse }> {
  const { data } = await apiClient.get<{ notifications: NotificationsResponse }>(
    "/notifications",
    {
      params:
        page !== undefined || perPage !== undefined
          ? { page, per_page: perPage }
          : undefined,
    },
  );
  return data;
}

/**
 * Mark one notification as read (idempotent). The id is the UUID primary
 * key; a foreign or missing id is an identical 404.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<NotificationReadResponse> {
  const { data } = await apiClient.post<NotificationReadResponse>(
    `/notifications/${notificationId}/read`,
  );
  return data;
}

/** Mark every unread notification of the authenticated user as read. */
export async function markAllNotificationsRead(): Promise<MarkAllNotificationsResponse> {
  const { data } = await apiClient.post<MarkAllNotificationsResponse>(
    "/notifications/read-all",
  );
  return data;
}