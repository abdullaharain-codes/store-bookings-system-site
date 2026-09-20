<?php

namespace App\Modules\Catalog\Repositories;

use App\Models\Product;
use App\Models\ProductImage;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

class EloquentProductRepository implements ProductRepositoryInterface
{
    public function find(int $id): ?Product
    {
        return Product::query()->find($id);
    }

    public function findBySlug(string $slug): ?Product
    {
        return Product::query()->where('slug', $slug)->first();
    }

    public function findBySku(string $sku): ?Product
    {
        return Product::query()->where('sku', $sku)->first();
    }

    public function findPublished(array $filters = []): LengthAwarePaginator
    {
        return $this->buildFilteredQuery($filters)
            ->where('is_published', true)
            ->paginate((int) ($filters['per_page'] ?? 15));
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return $this->buildFilteredQuery($filters)
            ->when(
                ($filters['status'] ?? null) === 'published',
                fn ($query) => $query->where('is_published', true)
            )
            ->when(
                ($filters['status'] ?? null) === 'unpublished',
                fn ($query) => $query->where('is_published', false)
            )
            ->paginate((int) ($filters['per_page'] ?? 15));
    }

    public function create(array $data): Product
    {
        return Product::query()->create($data);
    }

    public function update(Product $product, array $data): Product
    {
        $product->fill($data)->save();

        return $product;
    }

    public function delete(Product $product): void
    {
        $product->delete();
    }

    public function slugExists(string $slug, ?int $excludeId = null): bool
    {
        return Product::query()
            ->where('slug', $slug)
            ->when($excludeId !== null, fn ($query) => $query->where('id', '!=', $excludeId))
            ->exists();
    }

    public function skuExists(string $sku, ?int $excludeId = null): bool
    {
        return Product::query()
            ->where('sku', $sku)
            ->when($excludeId !== null, fn ($query) => $query->where('id', '!=', $excludeId))
            ->exists();
    }

    public function syncCategories(Product $product, array $categoryIds): void
    {
        $product->categories()->sync($categoryIds);
    }

    public function syncImages(Product $product, array $orderedAssetIds): void
    {
        // Full replace: the incoming ordered list is the new gallery state.
        $product->images()->delete();

        foreach (array_values($orderedAssetIds) as $index => $assetId) {
            ProductImage::query()->create([
                'product_id' => $product->id,
                'asset_id' => (int) $assetId,
                'display_order' => $index,
            ]);
        }
    }

    /**
     * Shared filter application for both listings. Eager-loading here covers
     * rules.md §10: list endpoints render related data without N+1 queries.
     */
    private function buildFilteredQuery(array $filters): Builder
    {
        return Product::query()
            ->with(['brand', 'categories', 'images.asset'])
            ->when(
                $filters['category_ids'] ?? null,
                fn ($query, array $ids) => $query->whereHas(
                    'categories',
                    fn ($query) => $query->whereIn('categories.id', $ids)
                )
            )
            ->when(
                $filters['brand_id'] ?? null,
                fn ($query, int $brandId) => $query->where('brand_id', $brandId)
            )
            ->when(
                $filters['search'] ?? null,
                fn ($query, string $search) => $query->where(function ($query) use ($search) {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%");
                })
            )
            ->when($filters['sort'] ?? null, function ($query, string $sort) {
                match ($sort) {
                    'price_asc' => $query->orderBy('price'),
                    'price_desc' => $query->orderByDesc('price'),
                    default => $query->orderByDesc('created_at')->orderByDesc('id'),
                };
            }, fn ($query) => $query->orderByDesc('created_at')->orderByDesc('id'));
    }
}
