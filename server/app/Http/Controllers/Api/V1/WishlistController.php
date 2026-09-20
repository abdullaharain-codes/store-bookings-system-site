<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Modules\Catalog\Services\WishlistService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WishlistController extends Controller
{
    public function __construct(
        private readonly WishlistService $wishlist,
    ) {}

    /**
     * GET /wishlist — the authenticated user's wishlisted products.
     */
    public function index(Request $request): JsonResponse
    {
        $items = $this->wishlist->list($request->user());

        return response()->json([
            'wishlist' => $items,
        ]);
    }

    /**
     * POST /wishlist/{product} — toggle: add if absent, remove if present.
     * Returns the current wishlisted state so the frontend can flip the
     * heart icon without a second round-trip.
     */
    public function toggle(Request $request, Product $product): JsonResponse
    {
        $isWishlisted = $this->wishlist->toggle($request->user(), $product);

        return response()->json([
            'is_wishlisted' => $isWishlisted,
        ]);
    }
}
