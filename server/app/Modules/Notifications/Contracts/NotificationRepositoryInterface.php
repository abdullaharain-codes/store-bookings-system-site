<?php

namespace App\Modules\Notifications\Contracts;

use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Notifications\DatabaseNotification;

interface NotificationRepositoryInterface
{
    /**
     * The given user's own notifications, most-recent-first, paginated
     * (default 15).
     */
    public function paginateForUser(User $user, int $perPage = 15): LengthAwarePaginator;

    /**
     * A single notification scoped to the given user. Returns null when the
     * id is genuinely missing OR belongs to another user — deliberately
     * indistinguishable (architecture.md §10).
     */
    public function findForUser(User $user, string $id): ?DatabaseNotification;

    public function markAsRead(DatabaseNotification $notification): DatabaseNotification;

    /**
     * Mark every unread notification of the given user as read.
     *
     * @return int number of notifications updated
     */
    public function markAllAsRead(User $user): int;
}
