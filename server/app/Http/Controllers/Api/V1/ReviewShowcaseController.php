<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\ReviewShowcase\Services\ReviewShowcaseService;
use Illuminate\Http\JsonResponse;

class ReviewShowcaseController extends Controller
{
    public function __construct(
        private readonly ReviewShowcaseService $showcase,
    ) {}

    /**
     * Storefront review-showcase gallery (architecture.md §4 review-showcase
     * module): published items in admin-defined display order, paginated, each
     * carrying its asset. No auth — the frontend renders this carousel from
     * the live endpoint (architecture.md §6).
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'review_showcase_items' => $this->showcase->listPublished(),
        ]);
    }
}
