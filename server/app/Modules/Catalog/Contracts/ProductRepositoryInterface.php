<?php

namespace App\Modules\Catalog\Contracts;

use App\Models\Product;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface ProductRepositoryInterface
{
    public function find(int $id): ?Product;

    public function findBySlug(string $slug): ?Product;

    public function findBySku(string $sku): ?Product;

    /**
     * Published-only, paginated listing for the storefront.
     *
     * Filter keys (all optional):
     * - category_ids: list<int> — ALREADY-RESOLVED category IDs (the caller
     *   obtains them via CategoryService::getProductScope(); this repository
     *   stays data-access-only and never calls Taxonomy services).
     * - brand_id: int
     * - featured: bool — present only when the caller supplied the flag;
     *   narrows to featured (true) or non-featured (false). findPublished
     *   always still requires is_published, so a featured-but-unpublished
     *   product can never be returned here.
     * - search: string (matches name or SKU)
     * - sort: 'price_asc'|'price_desc'|'newest' (default 'newest')
     * - per_page: int (default 15)
     */
    public function findPublished(array $filters = []): LengthAwarePaginator;

    /** Same filter shape as findPublished plus 'status' ('published'|'unpublished'); includes unpublished rows. */
    public function findAllForAdmin(array $filters = []): LengthAwarePaginator;

    public function create(array $data): Product;

    public function update(Product $product, array $data): Product;

    public function delete(Product $product): void;

    public function slugExists(string $slug, ?int $excludeId = null): bool;

    public function skuExists(string $sku, ?int $excludeId = null): bool;

    /** @param list<int> $categoryIds */
    public function syncCategories(Product $product, array $categoryIds): void;

    /**
     * Replace the product's gallery with the given asset IDs in the exact
     * order supplied (display_order = array index). Used by create AND update.
     *
     * @param  list<int>  $orderedAssetIds
     */
    public function syncImages(Product $product, array $orderedAssetIds): void;
}
