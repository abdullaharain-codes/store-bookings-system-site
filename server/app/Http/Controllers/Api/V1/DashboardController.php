<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Users\Services\DashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer account overview (PRD §5.2). Protected (auth:sanctum), no admin
 * gate, no {id} parameter — the aggregation is always computed for the
 * authenticated user only, mirroring ProfileController's self-service shape.
 * Thin controller; all aggregation logic lives in DashboardService
 * (rules.md §3).
 */
class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardService $dashboardService,
    ) {}

    /**
     * GET /dashboard — read-only summary of the authenticated user's own data.
     */
    public function show(Request $request): JsonResponse
    {
        return response()->json(
            $this->dashboardService->overview($request->user()),
        );
    }
}
