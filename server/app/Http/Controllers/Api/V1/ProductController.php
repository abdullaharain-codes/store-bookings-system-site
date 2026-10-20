<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Support\FeaturedProductFilter;
use App\Modules\Catalog\Support\ProductListFilters;
use App\Modules\Taxonomy\Services\CategoryService;
use App\Support\PerPage;
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
     *
     * ?featured= (BE2), and ?min_price= / ?max_price= / ?in_stock= (BE4), are
     * normalised and validated up front, so a junk value is a 422 rather than
     * a silently unfiltered result. per_page is clamped to 1..48 via the
     * shared PerPage helper (same cap as /services).
     */
    public function index(Request $request): JsonResponse
    {
        $featured = FeaturedProductFilter::normalize($request);

        $filters = $request->only(['brand_id', 'search', 'sort']);
        $filters['per_page'] = PerPage::fromRequest($request);

        $filters = array_merge($filters, ProductListFilters::normalize($request));

        if ($featured !== null) {
            $filters[FeaturedProductFilter::QUERY_KEY] = $featured;
        }

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
