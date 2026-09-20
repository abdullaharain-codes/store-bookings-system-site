<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ReviewShowcaseItem;
use App\Modules\ReviewShowcase\Http\Requests\ReorderReviewShowcaseItemsRequest;
use App\Modules\ReviewShowcase\Http\Requests\StoreReviewShowcaseItemRequest;
use App\Modules\ReviewShowcase\Http\Requests\UpdateReviewShowcaseItemRequest;
use App\Modules\ReviewShowcase\Services\ReviewShowcaseService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewShowcaseController extends Controller
{
    public function __construct(
        private readonly ReviewShowcaseService $showcase,
    ) {}

    /**
     * Admin listing — includes unpublished items. Filters (search, status,
     * per_page) pass straight through to the service; pagination metadata
     * rides on Laravel's standard paginator envelope (mirrors banners).
     * The search term matches against the item's caption text.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->showcase->listAllForAdmin(
            $request->only(['search', 'status', 'per_page']),
        );

        return response()->json($paginator->toArray());
    }

    public function show(ReviewShowcaseItem $reviewShowcaseItem): JsonResponse
    {
        return response()->json([
            'review_showcase_item' => $reviewShowcaseItem->load('asset'),
        ]);
    }

    public function store(StoreReviewShowcaseItemRequest $request): JsonResponse
    {
        $item = $this->showcase->create($request->validated());

        return response()->json([
            'review_showcase_item' => $item->load('asset'),
        ], 201);
    }

    public function update(UpdateReviewShowcaseItemRequest $request, ReviewShowcaseItem $reviewShowcaseItem): JsonResponse
    {
        $item = $this->showcase->update($reviewShowcaseItem, $request->validated());

        return response()->json([
            'review_showcase_item' => $item->refresh()->load('asset'),
        ]);
    }

    public function destroy(ReviewShowcaseItem $reviewShowcaseItem): JsonResponse
    {
        $this->showcase->delete($reviewShowcaseItem);

        return response()->json([
            'message' => 'Review showcase item deleted.',
        ]);
    }

    public function publish(ReviewShowcaseItem $reviewShowcaseItem): JsonResponse
    {
        $item = $this->showcase->publish($reviewShowcaseItem);

        return response()->json([
            'review_showcase_item' => $item->refresh()->load('asset'),
        ]);
    }

    public function unpublish(ReviewShowcaseItem $reviewShowcaseItem): JsonResponse
    {
        $item = $this->showcase->unpublish($reviewShowcaseItem);

        return response()->json([
            'review_showcase_item' => $item->refresh()->load('asset'),
        ]);
    }

    public function reorder(ReorderReviewShowcaseItemsRequest $request): JsonResponse
    {
        $this->showcase->reorder($request->validated('ordered_ids'));

        return response()->json([
            'message' => 'Review showcase reordered.',
        ]);
    }
}
