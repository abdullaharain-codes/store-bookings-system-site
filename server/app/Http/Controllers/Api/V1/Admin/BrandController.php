<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Modules\Taxonomy\Contracts\BrandRepositoryInterface;
use App\Modules\Taxonomy\Http\Requests\StoreBrandRequest;
use App\Modules\Taxonomy\Http\Requests\UpdateBrandRequest;
use App\Modules\Taxonomy\Services\BrandService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BrandController extends Controller
{
    public function __construct(
        private readonly BrandService $brands,
        private readonly BrandRepositoryInterface $brandRepository,
    ) {}

    /**
     * Admin listing — includes unpublished brands. Filters (search, status,
     * per_page) are passed straight through to the repository.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->brandRepository->findAllForAdmin(
            $request->only(['search', 'status', 'per_page']),
        );

        return response()->json($paginator->toArray());
    }

    public function show(Brand $brand): JsonResponse
    {
        return response()->json([
            'brand' => $brand,
        ]);
    }

    public function store(StoreBrandRequest $request): JsonResponse
    {
        $brand = $this->brands->createBrand($request->validated());

        return response()->json([
            'brand' => $brand,
        ], 201);
    }

    public function update(UpdateBrandRequest $request, Brand $brand): JsonResponse
    {
        $brand = $this->brands->updateBrand($brand, $request->validated());

        return response()->json([
            'brand' => $brand->refresh(),
        ]);
    }

    public function destroy(Brand $brand): JsonResponse
    {
        $this->brands->deleteBrand($brand);

        return response()->json([
            'message' => 'Brand deleted.',
        ]);
    }

    public function publish(Brand $brand): JsonResponse
    {
        $brand = $this->brands->publish($brand);

        return response()->json([
            'brand' => $brand,
        ]);
    }

    public function unpublish(Brand $brand): JsonResponse
    {
        $brand = $this->brands->unpublish($brand);

        return response()->json([
            'brand' => $brand,
        ]);
    }
}
