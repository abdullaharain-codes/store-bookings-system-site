<?php

namespace App\Modules\Users\Services;

use App\Models\User;
use App\Modules\Catalog\Services\WishlistService;
use App\Modules\Orders\Services\OrderService;
use App\Modules\Scheduling\Services\BookingService;
use Illuminate\Support\Carbon;

/**
 * Read-only aggregation of the authenticated customer's own account overview
 * (PRD §5.2 dashboard). Cross-module by nature (Orders, Scheduling,
 * Catalog/Wishlist) so it deliberately lives OUTSIDE any single module's
 * service — it composes each owning module's existing query paths
 * (rules.md §3): all ownership scoping (user_id) and the efficiency rules
 * live in those services, not here.
 *
 * Every value is derived from the passed User (always the authenticated
 * user — the controller never forwards an {id} parameter), so there is no
 * ownership-check surface beyond auth() itself.
 */
class DashboardService
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly BookingService $bookings,
        private readonly WishlistService $wishlist,
    ) {}

    /**
     * @return array{
     *     orders_count: int,
     *     upcoming_bookings: list<array{
     *         id: int,
     *         status: string,
     *         scheduled_slot_start: Carbon,
     *         service: array{name: ?string},
     *     }>,
     *     wishlist_count: int,
     * }
     */
    public function overview(User $user): array
    {
        return [
            'orders_count' => $this->orders->countOrders($user),
            'upcoming_bookings' => $this->bookings->upcomingBookings($user, 3)
                ->map(fn ($booking) => [
                    'id' => $booking->id,
                    'status' => $booking->status,
                    'scheduled_slot_start' => $booking->scheduled_slot_start,
                    'service' => ['name' => $booking->service?->name],
                ])
                ->values()
                ->all(),
            'wishlist_count' => $this->wishlist->count($user),
        ];
    }
}
