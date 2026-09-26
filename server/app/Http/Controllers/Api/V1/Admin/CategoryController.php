<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Modules\Taxonomy\Contracts\CategoryRepositoryInterface;
use App\Modules\Taxonomy\Http\Requests\StoreCategoryRequest;
use App\Modules\Taxonomy\Http\Requests\UpdateCategoryRequest;
use App\Modules\Taxonomy\Services\CategoryService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function __construct(
        private readonly CategoryService $categories,
        private readonly CategoryRepositoryInterface $categoryRepository,
    ) {}

    /**
     * Admin listing — includes unpublished categories. Filters (search, status,
     * per_page) are passed straight through to the repository; pagination
     * metadata rides on Laravel's standard paginator envelope.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->categoryRepository->findAllForAdmin(
            $request->only(['search', 'status', 'per_page']),
        );

        return response()->json($paginator->toArray());
    }

    public function show(Category $category): JsonResponse
    {
        $category->load(['logoAsset', 'bannerAsset']);

        return response()->json([
            'category' => $category,
        ]);
    }

    public function store(StoreCategoryRequest $request): JsonResponse
    {
        $category = $this->categories->createCategory($request->validated());

        return response()->json([
            'category' => $category,
        ], 201);
    }

    public function update(UpdateCategoryRequest $request, Category $category): JsonResponse
    {
        $category = $this->categories->updateCategory($category, $request->validated());

        return response()->json([
            'category' => $category->refresh(),
        ]);
    }

    public function destroy(Category $category): JsonResponse
    {
        $this->categories->deleteCategory($category);

        return response()->json([
            'message' => 'Category deleted.',
        ]);
    }

    public function publish(Category $category): JsonResponse
    {
        $category = $this->categories->publish($category);

        return response()->json([
            'category' => $category,
        ]);
    }

    public function unpublish(Category $category): JsonResponse
    {
        $category = $this->categories->unpublish($category);

        return response()->json([
            'category' => $category,
        ]);
    }
}
