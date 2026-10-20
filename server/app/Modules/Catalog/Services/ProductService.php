<?php

namespace App\Modules\Catalog\Services;

use App\Models\Asset;
use App\Models\Product;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Exceptions\ProductValidationException;
use App\Modules\Taxonomy\Services\CategoryService;
use App\Shared\AuditLogger;
use App\Shared\Concerns\GeneratesUniqueSlugs;
use App\Shared\FileUploadService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductService
{
    use GeneratesUniqueSlugs;

    public function __construct(
        private readonly ProductRepositoryInterface $products,
        private readonly CategoryService $taxonomy,
        private readonly AuditLogger $audit,
        private readonly FileUploadService $files,
    ) {}

    public function createProduct(array $data): Product
    {
        $name = trim($data['name']);

        $attributes = [
            'name' => $name,
            'slug' => $this->resolveSlug($data['slug'] ?? null, $name, excludeId: null),
            'sku' => $this->resolveSku($data['sku'] ?? null, excludeId: null),
            'description' => $data['description'] ?? null,
            // Cast here (not only at the FormRequest layer) because the service
            // is also callable from tests/other code without HTTP validation.
            'price' => (float) ($data['price'] ?? 0),
            'compare_at_price' => $this->normalizeCompareAtPrice($data['compare_at_price'] ?? null),
            'stock_quantity' => (int) ($data['stock_quantity'] ?? 0),
            'brand_id' => isset($data['brand_id']) ? (int) $data['brand_id'] : null,
            'is_published' => (bool) ($data['is_published'] ?? false),
            // Merchandising flag (BE2). Absent and explicit-false are the same
            // outcome: a new product starts life not featured.
            'is_featured' => (bool) ($data['is_featured'] ?? false),
        ];

        $categoryIds = array_map('intval', $data['category_ids'] ?? []);
        $this->assertCategoriesExist($categoryIds);

        $imageAssetIds = array_map('intval', $data['image_asset_ids'] ?? []);
        $this->assertAssetsExist($imageAssetIds);

        // Atomic: either the row, its categories, its gallery and the audit
        // entry all persist, or none do (rules.md §3 — no partial state).
        return DB::transaction(function () use ($attributes, $categoryIds, $imageAssetIds): Product {
            $product = $this->products->create($attributes);
            $this->products->syncCategories($product, $categoryIds);
            $this->products->syncImages($product, $imageAssetIds);

            $this->audit->log('Product', $product->id, 'created');

            return $product;
        });
    }

    public function updateProduct(Product $product, array $data): Product
    {
        $updates = [];

        if (array_key_exists('name', $data)) {
            $updates['name'] = trim($data['name']);
        }

        foreach (['description', 'price', 'stock_quantity', 'brand_id'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[$field] = $data[$field];
            }
        }

        // compare_at_price (DISCOUNT-1) is nullable: present-and-null or an
        // empty string clears the discount, so array_key_exists (not isset)
        // is what lets null through.
        if (array_key_exists('compare_at_price', $data)) {
            $updates['compare_at_price'] = $this->normalizeCompareAtPrice($data['compare_at_price']);
        }

        // Merchandising flag (BE2), cast here for the same reason price and
        // stock are: the service is callable outside HTTP validation.
        // array_key_exists (not isset) is what lets false through — isset()
        // would treat false as absent and the product could never be
        // un-featured.
        if (array_key_exists('is_featured', $data)) {
            $updates['is_featured'] = (bool) $data['is_featured'];
        }

        // Publication state changes must go through publish()/unpublish() so
        // every transition is audit-logged; silently accepting is_published
        // here would bypass the audit trail (same rule as Taxonomy).
        unset($data['is_published']);

        if (isset($updates['brand_id'])) {
            $updates['brand_id'] = (int) $updates['brand_id'];
        }
        if (isset($updates['stock_quantity'])) {
            $updates['stock_quantity'] = (int) $updates['stock_quantity'];
        }
        if (isset($updates['price'])) {
            $updates['price'] = (float) $updates['price'];
        }

        if (array_key_exists('slug', $data) || array_key_exists('name', $data)) {
            $updates['slug'] = $this->resolveSlug(
                $data['slug'] ?? null,
                $updates['name'] ?? $product->name,
                excludeId: $product->id,
            );
        }

        if (array_key_exists('sku', $data)) {
            $updates['sku'] = $this->resolveSku($data['sku'], excludeId: $product->id);
        }

        if (array_key_exists('category_ids', $data)) {
            $categoryIds = array_map('intval', $data['category_ids']);
            $this->assertCategoriesExist($categoryIds);
        } else {
            $categoryIds = null;
        }

        if (array_key_exists('image_asset_ids', $data)) {
            $imageAssetIds = array_map('intval', $data['image_asset_ids']);
            $this->assertAssetsExist($imageAssetIds);
        } else {
            $imageAssetIds = null;
        }

        // Compute which assets are being REPLACED before the transaction —
        // after syncImages commits, the old product_images rows are gone.
        // An asset present in both old and new sets is kept, never deleted.
        $replacedAssets = collect();

        if (array_key_exists('image_asset_ids', $data)) {
            $currentAssetIds = $product->images()->pluck('asset_id')->map(fn ($id) => (int) $id)->all();
            $removedIds = array_diff($currentAssetIds, $imageAssetIds);

            if ($removedIds !== []) {
                // Snapshot now: FileUploadService deletes rows post-commit,
                // and these model instances carry everything it needs.
                $replacedAssets = Asset::query()->whereIn('id', $removedIds)->get();
            }
        }

        // Atomic DB write; validation above already passed so a failure here
        // is an infrastructure-level problem and rolls back as a unit.
        DB::transaction(function () use ($product, $updates, $categoryIds, $imageAssetIds): void {
            if ($updates !== []) {
                $this->products->update($product, $updates);

                $this->audit->log('Product', $product->id, 'updated');
            }

            if ($categoryIds !== null) {
                $this->products->syncCategories($product, $categoryIds);
            }

            if ($imageAssetIds !== null) {
                $this->products->syncImages($product, $imageAssetIds);
            }
        });

        // Post-commit physical cleanup (same timing rationale as
        // deleteProduct): files are only removed once the DB state that
        // references them is durably gone. Deleting the asset row cascades
        // any leftover product_images reference at the DB level.
        // Same void-closure rule as deleteProduct: never expose FileUploadService's
        // boolean return to Collection::each()'s false-means-stop behaviour.
        $replacedAssets->each(function (Asset $asset): void {
            $this->files->delete($asset);
        });

        return $product;
    }

    public function publish(Product $product): Product
    {
        if ($product->is_published) {
            return $product;
        }

        $this->products->update($product, ['is_published' => true]);

        $this->audit->log('Product', $product->id, 'published', ['previous' => false]);

        return $product;
    }

    public function unpublish(Product $product): Product
    {
        if (! $product->is_published) {
            return $product;
        }

        $this->products->update($product, ['is_published' => false]);

        $this->audit->log('Product', $product->id, 'unpublished', ['previous' => true]);

        return $product;
    }

    public function deleteProduct(Product $product): void
    {
        // Collect the gallery's assets BEFORE the transaction: the product
        // delete cascades product_images rows away, so afterwards they are
        // unrecoverable for cleanup purposes.
        $galleryAssets = $product->images->map(fn ($image) => $image->asset)->filter();

        // DB work first, atomically. If this rolls back, the product row (and
        // its images) still exist — users see a working product, never broken
        // images.
        DB::transaction(function () use ($product): void {
            // Audit before deleting so the referenced entity row still exists
            // within the same atomic unit of work.
            $this->audit->log('Product', $product->id, 'deleted');

            $this->products->delete($product);
        });

        // Physical file + asset cleanup AFTER commit: files are only removed
        // once the rows referencing them are durably gone. If the process dies
        // between commit and cleanup, the worst case is orphaned files —
        // recoverable — rather than a live product pointing at deleted files.
        // Void closure on purpose: Collection::each() aborts on a strict
        // false return, which must never depend on FileUploadService's
        // boolean result.
        $galleryAssets->each(function (Asset $asset): void {
            $this->files->delete($asset);
        });
    }

    /**
     * Replace a product's category assignments (validated).
     *
     * @param  list<int>  $categoryIds
     */
    public function setCategories(Product $product, array $categoryIds): Product
    {
        $categoryIds = array_map('intval', $categoryIds);
        $this->assertCategoriesExist($categoryIds);

        $this->products->syncCategories($product, $categoryIds);

        return $product;
    }

    /**
     * Replace a product's image gallery with the given asset IDs in order.
     *
     * @param  list<int>  $orderedAssetIds
     */
    public function setImages(Product $product, array $orderedAssetIds): Product
    {
        $orderedAssetIds = array_map('intval', $orderedAssetIds);
        $this->assertAssetsExist($orderedAssetIds);

        $this->products->syncImages($product, $orderedAssetIds);

        return $product;
    }

    /**
     * Every given category must exist, checked in ONE batched query through
     * the Taxonomy service (rules.md §10 N+1 avoidance; architecture.md §3
     * module boundary). The exception names ALL missing IDs at once.
     *
     * @param  list<int>  $categoryIds
     */
    private function assertCategoriesExist(array $categoryIds): void
    {
        if ($categoryIds === []) {
            return;
        }

        $uniqueIds = array_values(array_unique($categoryIds));

        $existingIds = $this->taxonomy->findCategoriesByIds($uniqueIds)->pluck('id')->map(fn ($id) => (int) $id)->all();

        $missing = array_diff($uniqueIds, $existingIds);

        if ($missing !== []) {
            throw new ProductValidationException(
                'Invalid category ID(s) in category_ids: '.implode(', ', $missing).'.',
            );
        }
    }

    /**
     * Assets live in the Shared layer (same one FileUploadService writes to),
     * so a direct existence check here crosses no module boundary.
     *
     * @param  list<int>  $assetIds
     */
    private function assertAssetsExist(array $assetIds): void
    {
        if ($assetIds === []) {
            return;
        }

        $existing = Asset::query()->whereIn('id', array_unique($assetIds))->pluck('id')->all();
        $missing = array_diff(array_unique($assetIds), $existing);

        if ($missing !== []) {
            throw new ProductValidationException(
                'Invalid asset ID(s) in image_asset_ids: '.implode(', ', $missing).'.',
            );
        }
    }

    /**
     * Explicitly provided slugs are normalized then enforced strictly: an
     * admin-chosen slug that collides is a validation error, not something we
     * silently rename. Auto-generated slugs get -2/-3 suffixing instead.
     */
    private function resolveSlug(?string $providedSlug, string $name, ?int $excludeId): string
    {
        if ($providedSlug !== null && trim($providedSlug) !== '') {
            $slug = Str::slug($providedSlug);

            if ($this->products->slugExists($slug, $excludeId)) {
                throw new ProductValidationException("The slug \"{$slug}\" is already in use by another product.");
            }

            return $slug;
        }

        return $this->uniqueSlug(
            Str::slug($name),
            fn (string $candidate): bool => $this->products->slugExists($candidate, $excludeId),
        );
    }

    private function resolveSku(mixed $sku, ?int $excludeId): string
    {
        $normalized = trim((string) $sku);

        if ($normalized === '') {
            throw new ProductValidationException('The SKU is required.');
        }

        if ($this->products->skuExists($normalized, $excludeId)) {
            throw new ProductValidationException("The SKU \"{$normalized}\" is already in use by another product.");
        }

        return $normalized;
    }

    /**
     * Null/empty/whitespace all mean "no discount" and collapse to null;
     * otherwise the value is cast to a float. The strictly-greater-than
     * invariant is enforced at the FormRequest layer (and here a DB column),
     * not re-checked in this service — same pattern as price.
     */
    private function normalizeCompareAtPrice(mixed $compareAt): ?float
    {
        if ($compareAt === null || trim((string) $compareAt) === '') {
            return null;
        }

        return (float) $compareAt;
    }
}
