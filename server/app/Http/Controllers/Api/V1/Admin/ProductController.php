<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Http\Requests\StoreProductRequest;
use App\Modules\Catalog\Http\Requests\UpdateProductRequest;
use App\Modules\Catalog\Services\ProductService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function __construct(
        private readonly ProductService $products,
        private readonly ProductRepositoryInterface $productRepository,
    ) {}

    /**
     * Admin listing — includes unpublished products. Filters (search, status,
     * brand_id, per_page) are passed straight through to the repository;
     * pagination metadata rides on Laravel's standard paginator envelope.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->productRepository->findAllForAdmin(
            $request->only(['search', 'status', 'brand_id', 'per_page']),
        );

        return response()->json($paginator->toArray());
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json([
            'product' => $product,
        ]);
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $product = $this->products->createProduct($request->validated());

        return response()->json([
            'product' => $product,
        ], 201);
    }

    public function update(UpdateProductRequest $request, Product $product): JsonResponse
    {
        $product = $this->products->updateProduct($product, $request->validated());

        return response()->json([
            'product' => $product->refresh(),
        ]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->products->deleteProduct($product);

        return response()->json([
            'message' => 'Product deleted.',
        ]);
    }

    public function publish(Product $product): JsonResponse
    {
        $product = $this->products->publish($product);

        return response()->json([
            'product' => $product,
        ]);
    }

    public function unpublish(Product $product): JsonResponse
    {
        $product = $this->products->unpublish($product);

        return response()->json([
            'product' => $product,
        ]);
    }
}
