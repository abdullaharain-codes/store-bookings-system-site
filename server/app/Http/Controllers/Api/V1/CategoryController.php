<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Taxonomy\Contracts\CategoryRepositoryInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function __construct(
        private readonly CategoryRepositoryInterface $categories,
    ) {}

    /**
     * Public, published-only listing.
     *
     * Semantics (deliberate, flagged as ambiguous in Step 2.2): with no
     * ?parent_id, ALL published categories from both levels are returned so
     * the frontend can build the category tree client-side — taxonomy is
     * never hard-coded (architecture.md §6). With ?parent_id, only the
     * published direct children of that parent are returned.
     */
    public function index(Request $request): JsonResponse
    {
        $parentId = $request->query('parent_id');

        $categories = $this->categories->findPublished(
            $parentId !== null ? (int) $parentId : null,
        );

        return response()->json([
            'categories' => $categories,
        ]);
    }

    /**
     * Published-only detail lookup by slug. Missing AND unpublished slugs both
     * return the identical 404 — an unpublished category must be unreachable
     * via the public API without leaking that it exists (IDOR-safe per
     * architecture.md §10).
     */
    public function show(string $slug): JsonResponse
    {
        $category = $this->categories->findBySlug($slug);

        if (! $category || ! $category->is_published) {
            abort(404);
        }

        return response()->json([
            'category' => $category,
        ]);
    }
}
