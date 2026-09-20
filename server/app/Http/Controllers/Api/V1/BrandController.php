<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Taxonomy\Contracts\BrandRepositoryInterface;
use Illuminate\Http\JsonResponse;

class BrandController extends Controller
{
    public function __construct(
        private readonly BrandRepositoryInterface $brands,
    ) {}

    /**
     * Public, published-only listing (PRD §7.1 — "Shop by Brand" and shop
     * filters are generated from this single live source).
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'brands' => $this->brands->findPublished(),
        ]);
    }

    /**
     * Published-only detail lookup by slug. Missing AND unpublished slugs both
     * return the identical 404 — no existence leak (IDOR-safe per
     * architecture.md §10).
     */
    public function show(string $slug): JsonResponse
    {
        $brand = $this->brands->findBySlug($slug);

        if (! $brand || ! $brand->is_published) {
            abort(404);
        }

        return response()->json([
            'brand' => $brand,
        ]);
    }
}
