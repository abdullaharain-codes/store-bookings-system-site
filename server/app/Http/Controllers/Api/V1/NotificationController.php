<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    /**
     * GET /notifications — the authenticated user's OWN notifications,
     * most-recent-first, paginated (default 15). No {id} in the list URL,
     * so the ownership surface is always the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'notifications' => $this->notifications->listForUser(
                $request->user(),
                (int) $request->query('per_page', 15),
            ),
        ]);
    }

    /**
     * POST /notifications/{notification}/read — mark one notification as
     * read. Ownership is enforced in NotificationService: a foreign-owned
     * id responds identically to a genuinely-missing one (404,
     * architecture.md §10) — never 403, never the notification's data.
     */
    public function markRead(Request $request, string $notification): JsonResponse
    {
        $notification = $this->notifications->markAsRead($request->user(), $notification);

        return response()->json([
            'notification' => $notification,
        ]);
    }

    /**
     * POST /notifications/read-all — mark every unread notification of the
     * authenticated user as read.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        return response()->json([
            'marked' => $this->notifications->markAllAsRead($request->user()),
        ]);
    }
}
