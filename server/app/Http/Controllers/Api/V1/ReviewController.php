<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Reviews\Http\Requests\SubmitReviewRequest;
use App\Modules\Reviews\Services\ReviewService;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    public function __construct(
        private readonly ReviewService $reviews,
        private readonly ProductRepositoryInterface $products,
        private readonly ServiceRepositoryInterface $services,
    ) {}

    /**
     * POST /reviews — submit a review of a product or service (authenticated
     * customer). Eligibility (delivered order / completed booking) is
     * enforced inside ReviewService.
     */
    public function store(SubmitReviewRequest $request): JsonResponse
    {
        $review = $this->reviews->submitReview($request->user(), $request->validated());

        return response()->json([
            'review' => $review,
        ], 201);
    }

    /**
     * Public read of a product's reviews. Published-only, paginated. A missing
     * OR unpublished product is an identical 404 (mirrors ProductController@show
     * — an unpublished product must stay unreachable without leaking existence).
     */
    public function productReviews(string $slug, Request $request): JsonResponse
    {
        $product = $this->products->findBySlug($slug);

        if (! $product || ! $product->is_published) {
            abort(404);
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->reviews->listForProduct(
            $product,
            (int) $request->query('per_page', 15),
        );

        return response()->json([
            'reviews' => $paginator,
        ]);
    }

    /**
     * Public read of a service's reviews. Published-only, paginated. A missing
     * OR unpublished service is an identical 404 (mirrors ServiceController@show).
     */
    public function serviceReviews(string $slug, Request $request): JsonResponse
    {
        $service = $this->services->findBySlug($slug);

        if (! $service || ! $service->is_published) {
            abort(404);
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->reviews->listForService(
            $service,
            (int) $request->query('per_page', 15),
        );

        return response()->json([
            'reviews' => $paginator,
        ]);
    }
}
