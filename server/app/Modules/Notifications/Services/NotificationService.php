<?php

namespace App\Modules\Notifications\Services;

use App\Models\Order;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Modules\Notifications\Contracts\NotificationRepositoryInterface;
use App\Notifications\BookingFinalPriceEntered;
use App\Notifications\BookingRescheduled;
use App\Notifications\BookingStatusChanged;
use App\Notifications\OrderStatusChanged;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Log;

/**
 * Notification business rules (PRD §11 / release plan Tasks 11.1–11.3).
 *
 * Read/mark-as-read infrastructure (Task 11.1) plus the composer triggers
 * for order status changes (11.2) and booking status/final-price changes
 * (11.3). Every read path is scoped to the authenticated user: the list has
 * no {id} at all, and a single-notification mark treats a foreign-owned id
 * identically to a genuinely-missing one (ResourceNotFoundException →
 * identical 404, architecture.md §10).
 */
class NotificationService
{
    public function __construct(
        private readonly NotificationRepositoryInterface $notifications,
    ) {}

    /**
     * Record + email an order status change to the order's owner (Task 11.2).
     *
     * The notification decision lives in OrderStatusChanged::via(), NOT here
     * — the caller (OrderService) fires after its transaction commits, and
     * this method is the failure isolation boundary: a send failure is logged
     * and swallowed, never rethrown, so a notification problem can never roll
     * back or fail the already-committed status transition (SRS §6.4).
     */
    public function notifyOrderStatusChanged(Order $order, string $previousStatus): void
    {
        try {
            $order->user->notify(new OrderStatusChanged($order, $previousStatus));
        } catch (\Throwable $e) {
            Log::error(
                "Failed to send order status-change notification for order {$order->id}: {$e->getMessage()}",
            );
        }
    }

    /**
     * Record + email a booking status change to the booking's customer
     * (Task 11.3). Identical failure-isolation pattern to
     * notifyOrderStatusChanged(): fired by BookingService after its
     * transaction commits, logged and swallowed on failure, never rethrown.
     */
    public function notifyBookingStatusChanged(ServiceBooking $booking, string $previousStatus): void
    {
        try {
            $booking->user->notify(new BookingStatusChanged($booking, $previousStatus));
        } catch (\Throwable $e) {
            Log::error(
                "Failed to send booking status-change notification for booking {$booking->id}: {$e->getMessage()}",
            );
        }
    }

    /**
     * Record + email a booking's final price to the booking's customer
     * (Task 11.3). Distinct from notifyBookingStatusChanged() because
     * final-price entry is its own event (PRD §10); enterFinalPrice() fires
     * ONLY this notification, never a status-change one (one business action
     * → one notification). Fired after BookingService's commit; logged and
     * swallowed on failure, never rethrown (SRS §6.4).
     */
    public function notifyBookingFinalPriceEntered(ServiceBooking $booking): void
    {
        try {
            $booking->user->notify(new BookingFinalPriceEntered($booking));
        } catch (\Throwable $e) {
            Log::error(
                "Failed to send booking final-price notification for booking {$booking->id}: {$e->getMessage()}",
            );
        }
    }

    /**
     * Record + email a booking reschedule to the booking's customer (BE7b).
     * Fired after BookingService's reschedule transaction commits; logged and
     * swallowed on failure, never rethrown (SRS 6.4).
     */
    public function notifyBookingRescheduled(ServiceBooking $newBooking, ServiceBooking $oldBooking, bool $isAdmin = false, ?string $reason = null): void
    {
        try {
            $newBooking->user->notify(new BookingRescheduled($newBooking, $oldBooking->id, $isAdmin, $reason));
        } catch (\Throwable $e) {
            Log::error(
                "Failed to send booking reschedule notification for booking {$newBooking->id}: {$e->getMessage()}",
            );
        }
    }

    /**
     * The authenticated user's own notifications, most-recent-first.
     */
    public function listForUser(User $user, int $perPage = 15): LengthAwarePaginator
    {
        return $this->notifications->paginateForUser($user, $perPage);
    }

    /**
     * Mark a single notification as read (idempotent — an already-read
     * notification is simply returned). Ownership is enforced here: a
     * notification belonging to another user is indistinguishable from one
     * that does not exist.
     *
     * @throws ResourceNotFoundException when the notification is missing or
     *                                   not owned by the user
     */
    public function markAsRead(User $user, string $notificationId): DatabaseNotification
    {
        $notification = $this->notifications->findForUser($user, $notificationId);

        if (! $notification) {
            throw new ResourceNotFoundException;
        }

        return $this->notifications->markAsRead($notification);
    }

    /**
     * Mark every unread notification of the given user as read.
     *
     * @return int number of notifications marked read
     */
    public function markAllAsRead(User $user): int
    {
        return $this->notifications->markAllAsRead($user);
    }
}
