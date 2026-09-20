<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Taxonomy\Services\CategoryService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function __construct(
        private readonly ProductRepositoryInterface $products,
        private readonly CategoryService $taxonomy,
    ) {}

    /**
     * Public, published-only product listing with filters.
     *
     * ?category_id= is resolved through the Taxonomy service so a PARENT
     * category automatically includes products assigned to any of its
     * descendants (cross-module scope, architecture.md §3). brand_id, search
     * and sort pass straight through; ?page= is consumed by the paginator.
     */
    public function index(Request $request): JsonResponse
    {
        // per_page rides along like on every other list endpoint; ?page= is
        // consumed by the paginator itself.
        $filters = $request->only(['brand_id', 'search', 'sort', 'per_page']);

        if ($categoryId = $request->query('category_id')) {
            $filters['category_ids'] = $this->taxonomy->getProductScope((int) $categoryId);
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->products->findPublished($filters);

        return response()->json($paginator->toArray());
    }

    /**
     * Published-only detail lookup by slug. Missing AND unpublished slugs both
     * return the identical 404 — an unpublished product must be unreachable
     * via the public API without leaking that it exists (IDOR-safe per
     * architecture.md §10).
     */
    public function show(string $slug): JsonResponse
    {
        $product = $this->products->findBySlug($slug);

        if (! $product || ! $product->is_published) {
            abort(404);
        }

        // Detail rendering needs the related data. Three deterministic queries
        // for a single record — not an N+1 loop (rules.md §10 targets lists).
        $product->load(['brand', 'categories', 'images.asset']);

        return response()->json([
            'product' => $product,
        ]);
    }
}
