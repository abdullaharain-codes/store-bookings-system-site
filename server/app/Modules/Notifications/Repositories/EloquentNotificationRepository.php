<?php

namespace App\Modules\Notifications\Repositories;

use App\Models\User;
use App\Modules\Notifications\Contracts\NotificationRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Notifications\DatabaseNotification;

class EloquentNotificationRepository implements NotificationRepositoryInterface
{
    public function paginateForUser(User $user, int $perPage = 15): LengthAwarePaginator
    {
        return $this->forUser($user)
            ->latest()
            ->paginate($perPage);
    }

    public function findForUser(User $user, string $id): ?DatabaseNotification
    {
        return $this->forUser($user)
            ->find($id);
    }

    public function markAsRead(DatabaseNotification $notification): DatabaseNotification
    {
        $notification->markAsRead();

        return $notification;
    }

    public function markAllAsRead(User $user): int
    {
        return $this->forUser($user)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    /**
     * Scope every query to the given notifiable so reads can never touch
     * another user's notifications (architecture.md §10).
     */
    private function forUser(User $user): Builder
    {
        return DatabaseNotification::query()
            ->where('notifiable_type', $user->getMorphClass())
            ->where('notifiable_id', $user->getKey());
    }
}
