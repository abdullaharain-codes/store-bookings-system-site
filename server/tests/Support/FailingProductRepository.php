<?php

namespace Tests\Support;

use App\Models\Product;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use RuntimeException;

/**
 * Test double wrapping the real product repository: delegates every call,
 * but throws on the configured method names to simulate infrastructure
 * failures mid-transaction. Deterministic alternative to Mockery partials.
 */
class FailingProductRepository implements ProductRepositoryInterface
{
    /** @param list<string> $failingMethods */
    public function __construct(
        private readonly ProductRepositoryInterface $inner,
        private readonly array $failingMethods = [],
    ) {}

    private function delegate(string $method, callable $action): mixed
    {
        if (in_array($method, $this->failingMethods, true)) {
            throw new RuntimeException("injected failure in {$method}");
        }

        return $action();
    }

    public function find(int $id): ?Product
    {
        return $this->delegate('find', fn () => $this->inner->find($id));
    }

    public function findBySlug(string $slug): ?Product
    {
        return $this->delegate('findBySlug', fn () => $this->inner->findBySlug($slug));
    }

    public function findBySku(string $sku): ?Product
    {
        return $this->delegate('findBySku', fn () => $this->inner->findBySku($sku));
    }

    public function findPublished(array $filters = []): LengthAwarePaginator
    {
        return $this->delegate('findPublished', fn () => $this->inner->findPublished($filters));
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return $this->delegate('findAllForAdmin', fn () => $this->inner->findAllForAdmin($filters));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Product
    {
        return $this->delegate('create', fn () => $this->inner->create($data));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Product $product, array $data): Product
    {
        return $this->delegate('update', fn () => $this->inner->update($product, $data));
    }

    public function delete(Product $product): void
    {
        $this->delegate('delete', fn () => $this->inner->delete($product));
    }

    public function slugExists(string $slug, ?int $excludeId = null): bool
    {
        return $this->delegate('slugExists', fn () => $this->inner->slugExists($slug, $excludeId));
    }

    public function skuExists(string $sku, ?int $excludeId = null): bool
    {
        return $this->delegate('skuExists', fn () => $this->inner->skuExists($sku, $excludeId));
    }

    /**
     * @param  list<int>  $categoryIds
     */
    public function syncCategories(Product $product, array $categoryIds): void
    {
        $this->delegate('syncCategories', fn () => $this->inner->syncCategories($product, $categoryIds));
    }

    /**
     * @param  list<int>  $orderedAssetIds
     */
    public function syncImages(Product $product, array $orderedAssetIds): void
    {
        $this->delegate('syncImages', fn () => $this->inner->syncImages($product, $orderedAssetIds));
    }
}
