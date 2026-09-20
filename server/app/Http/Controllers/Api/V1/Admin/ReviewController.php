<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Modules\Reviews\Contracts\ReviewRepositoryInterface;
use App\Modules\Reviews\Services\ReviewService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin reviews surface: moderation listing (including unpublished reviews,
 * filterable) + the only two state-changing actions a review has — publish
 * and unpublish. Mirrors Admin\BannerController: the controller stays thin,
 * the audit/logic lives in ReviewService.
 */
class ReviewController extends Controller
{
    public function __construct(
        private readonly ReviewService $reviews,
        private readonly ReviewRepositoryInterface $reviewRepository,
    ) {}

    /**
     * GET /admin/reviews — paginated list of ALL reviews (published and
     * unpublished), optionally filtered by product_id, service_id, rating,
     * and status ('published'|'unpublished').
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->reviewRepository->listAllForAdmin(
            $request->only(['product_id', 'service_id', 'rating', 'status', 'per_page']),
        );

        return response()->json([
            'reviews' => $paginator,
        ]);
    }

    public function publish(Review $review): JsonResponse
    {
        $review = $this->reviews->publish($review);

        return response()->json([
            'review' => $review->refresh(),
        ]);
    }

    public function unpublish(Review $review): JsonResponse
    {
        $review = $this->reviews->unpublish($review);

        return response()->json([
            'review' => $review->refresh(),
        ]);
    }
}
