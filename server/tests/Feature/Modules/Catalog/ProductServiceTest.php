<?php

use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Product;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Exceptions\ProductValidationException;
use App\Modules\Catalog\Repositories\EloquentProductRepository;
use App\Modules\Catalog\Services\ProductService;
use App\Modules\Taxonomy\Services\CategoryService;
use App\Shared\FileUploadService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\FailingProductRepository;

uses(RefreshDatabase::class);

function productService(): ProductService
{
    return app(ProductService::class);
}

// ─── Slug handling ───────────────────────────────────────────────────────────

test('slug is auto-generated from the name and suffixed on collisions', function () {
    $first = productService()->createProduct([
        'name' => 'Gaming Mouse',
        'sku' => 'GM-1',
        'price' => 2500,
    ]);
    $second = productService()->createProduct([
        'name' => 'Gaming Mouse',
        'sku' => 'GM-2',
        'price' => 2600,
    ]);

    expect($first->slug)->toBe('gaming-mouse')
        ->and($second->slug)->toBe('gaming-mouse-2');
});

test('an explicitly provided slug colliding with another product throws', function () {
    productService()->createProduct(['name' => 'Alpha', 'slug' => 'taken', 'sku' => 'A-1', 'price' => 100]);

    productService()->createProduct(['name' => 'Beta', 'slug' => 'taken', 'sku' => 'B-1', 'price' => 200]);
})->throws(ProductValidationException::class, 'The slug "taken" is already in use');

// ─── SKU rules ───────────────────────────────────────────────────────────────

test('a duplicate SKU is rejected with a listing message', function () {
    productService()->createProduct(['name' => 'First', 'sku' => 'DUP-SKU', 'price' => 100]);

    productService()->createProduct(['name' => 'Second', 'sku' => 'DUP-SKU', 'price' => 100]);
})->throws(ProductValidationException::class, 'The SKU "DUP-SKU" is already in use by another product.');

test('an empty SKU is rejected — SKUs are assigned intentionally, never auto-generated', function () {
    productService()->createProduct(['name' => 'No Sku', 'sku' => '', 'price' => 100]);
})->throws(ProductValidationException::class, 'The SKU is required.');

// ─── Category validation ─────────────────────────────────────────────────────

test('create rejects an invalid category_id and names it in the message', function () {
    $valid = Category::factory()->create();

    try {
        productService()->createProduct([
            'name' => 'Broken',
            'sku' => 'BROKEN-1',
            'price' => 100,
            'category_ids' => [$valid->id, 424242],
        ]);
        $this->fail('Expected ProductValidationException was not thrown.');
    } catch (ProductValidationException $e) {
        expect($e->getMessage())->toContain('424242')
            ->not->toContain((string) $valid->id);
    }

    // Nothing persisted when validation fails mid-flight.
    expect(Product::where('sku', 'BROKEN-1')->exists())->toBeFalse();
});

// ─── Publication lifecycle ───────────────────────────────────────────────────

test('publish/unpublish write correct audit rows and are idempotent', function () {
    $product = productService()->createProduct(['name' => 'Pub Test', 'sku' => 'PUB-1', 'price' => 500]);

    productService()->publish($product);
    $product->refresh();
    expect($product->is_published)->toBeTrue()
        ->and(AuditLog::where(['entity' => 'Product', 'entity_id' => $product->id, 'action' => 'published'])
            ->where('metadata->previous', false)->count())->toBe(1);

    // Idempotent no-op: no duplicate audit row.
    productService()->publish($product);
    expect(AuditLog::where(['entity' => 'Product', 'entity_id' => $product->id, 'action' => 'published'])->count())->toBe(1);

    productService()->unpublish($product);
    $product->refresh();
    expect($product->is_published)->toBeFalse()
        ->and(AuditLog::where(['entity' => 'Product', 'entity_id' => $product->id, 'action' => 'unpublished'])
            ->where('metadata->previous', true)->count())->toBe(1);
});

test('update strips is_published tampering instead of applying it silently', function () {
    $product = productService()->createProduct(['name' => 'Tamper', 'sku' => 'TMP-1', 'price' => 100]);

    productService()->updateProduct($product, ['is_published' => true]);

    expect($product->refresh()->is_published)->toBeFalse()
        ->and(AuditLog::where('entity_id', $product->id)->whereIn('action', ['updated', 'published'])->count())->toBe(0);
});

test('update writes an updated audit row and re-resolves slug from new name', function () {
    $product = productService()->createProduct(['name' => 'Old Name', 'sku' => 'UPD-1', 'price' => 100]);

    productService()->updateProduct($product, ['name' => 'New Name']);

    expect($product->refresh()->slug)->toBe('new-name')
        ->and(AuditLog::where(['entity' => 'Product', 'entity_id' => $product->id, 'action' => 'updated'])->exists())
        ->toBeTrue();
});

// ─── Deletion + asset cleanup ────────────────────────────────────────────────

test('deleting a product cleans up each image asset via FileUploadService', function () {
    $spy = $this->spy(FileUploadService::class);

    $assetOne = Asset::factory()->create();
    $assetTwo = Asset::factory()->create();

    $product = productService()->createProduct([
        'name' => 'With Images',
        'sku' => 'IMG-1',
        'price' => 900,
        'image_asset_ids' => [$assetOne->id, $assetTwo->id],
    ]);
    expect($product->images()->count())->toBe(2);

    productService()->deleteProduct($product->fresh());

    expect(Product::find($product->id))->toBeNull()
        ->and($product->images()->count())->toBe(0)
        ->and(AuditLog::where(['entity' => 'Product', 'entity_id' => $product->id, 'action' => 'deleted'])->exists())
        ->toBeTrue();

    // One cleanup call per gallery image — asserted via spy, zero real I/O.
    $spy->shouldHaveReceived('delete')->twice();
});

// ─── Category/image syncs ────────────────────────────────────────────────────

test('setCategories fully syncs assignments (adds new, removes old)', function () {
    $initial = Category::factory()->create();
    $replacement = Category::factory()->create();

    $product = productService()->createProduct([
        'name' => 'Sync Me',
        'sku' => 'SYNC-1',
        'price' => 100,
        'category_ids' => [$initial->id],
    ]);

    expect($product->categories()->pluck('categories.id')->all())->toBe([$initial->id]);

    productService()->setCategories($product, [$replacement->id]);

    $product->refresh();
    expect($product->categories()->pluck('categories.id')->all())->toBe([$replacement->id])
        ->and($product->categories()->pluck('categories.id'))->not->toContain($initial->id);
});

test('setImages rejects unknown asset IDs before touching the gallery', function () {
    $asset = Asset::factory()->create();
    $product = productService()->createProduct([
        'name' => 'Gallery Guard',
        'sku' => 'GAL-1',
        'price' => 100,
        'image_asset_ids' => [$asset->id],
    ]);

    try {
        productService()->setImages($product, [$asset->id, 987654]);
        $this->fail('Expected ProductValidationException was not thrown.');
    } catch (ProductValidationException $e) {
        expect($e->getMessage())->toContain('987654');
    }

    // Original gallery untouched after failed sync.
    expect($product->images()->pluck('asset_id')->all())->toBe([$asset->id]);
});

// ─── Cross-module wiring: getProductScope() → repository filter ──────────────

test('querying by a parent category scope finds products assigned only to its child', function () {
    $taxonomy = app(CategoryService::class);
    $repository = app(ProductRepositoryInterface::class);

    $parent = Category::factory()->create(['is_published' => true]);
    $child = Category::factory()->create(['parent_category_id' => $parent->id, 'is_published' => true]);
    $unrelated = Category::factory()->create(['is_published' => true]);

    $childOnlyProduct = productService()->createProduct([
        'name' => 'In Child Scope',
        'sku' => 'SCOPE-1',
        'price' => 1000,
        'is_published' => true,
        'category_ids' => [$child->id],
    ]);
    productService()->createProduct([
        'name' => 'Outside Scope',
        'sku' => 'SCOPE-2',
        'price' => 2000,
        'is_published' => true,
        'category_ids' => [$unrelated->id],
    ]);
    // Unpublished match must never leak into public listings.
    productService()->createProduct([
        'name' => 'Hidden Match',
        'sku' => 'SCOPE-3',
        'price' => 3000,
        'category_ids' => [$child->id],
    ]);

    // The integration point under test: Taxonomy resolves parent → [parent, child].
    $scope = $taxonomy->getProductScope($parent->id);
    expect($scope)->toContain($parent->id, $child->id);

    /** @var LengthAwarePaginator $page */
    $page = $repository->findPublished(['category_ids' => $scope, 'per_page' => 15]);

    $ids = collect($page->items())->pluck('id')->all();
    expect($ids)->toContain($childOnlyProduct->id)
        ->and(count($ids))->toBe(1)
        ->and($page->first()->relationLoaded('brand'))->toBeTrue()
        ->and($page->first()->relationLoaded('categories'))->toBeTrue()
        ->and($page->first()->relationLoaded('images'))->toBeTrue();
});

// ─── Transaction safety ──────────────────────────────────────────────────────

test('a mid-create failure rolls back the entire product write', function () {
    // Deterministic double: real behavior everywhere EXCEPT syncImages,
    // which fails mid-sequence so the transaction must roll everything back.
    $this->app->bind(ProductRepositoryInterface::class, fn () => new FailingProductRepository(
        new EloquentProductRepository,
        ['syncImages'],
    ));

    $category = Category::factory()->create();
    $asset = Asset::factory()->create();

    try {
        productService()->createProduct([
            'name' => 'Atomic Check',
            'sku' => 'ATOM-1',
            'price' => 100,
            'category_ids' => [$category->id],
            'image_asset_ids' => [$asset->id],
        ]);
        $this->fail('Expected injected failure did not surface.');
    } catch (RuntimeException $e) {
        expect($e->getMessage())->toBe('injected failure in syncImages');
    }

    // Nothing persisted: no product row, no pivot rows, no gallery, no audit.
    expect(Product::where('sku', 'ATOM-1')->exists())->toBeFalse()
        ->and(DB::table('product_category')->where('category_id', $category->id)->count())->toBe(0)
        ->and(AuditLog::where(['entity' => 'Product', 'action' => 'created'])->exists())->toBeFalse();

    // And the slug is free again for a retry with identical data — restore
    // the real repository first so the retry itself can succeed.
    $this->app->bind(ProductRepositoryInterface::class, EloquentProductRepository::class);

    $retry = app(ProductService::class)->createProduct([
        'name' => 'Atomic Check',
        'sku' => 'ATOM-1',
        'price' => 100,
    ]);
    expect($retry->slug)->toBe('atomic-check');
});

test('a mid-update failure leaves the product fully unchanged', function () {
    $product = productService()->createProduct([
        'name' => 'Before Failure',
        'sku' => 'MID-1',
        'price' => 100,
    ]);

    $this->app->bind(ProductRepositoryInterface::class, fn () => new FailingProductRepository(
        new EloquentProductRepository,
        ['update'],
    ));

    try {
        productService()->updateProduct($product->fresh(), ['name' => 'After Failure']);
        $this->fail('Expected injected failure did not surface.');
    } catch (RuntimeException $e) {
        expect($e->getMessage())->toBe('injected failure in update');
    }

    $product->refresh();
    expect($product->name)->toBe('Before Failure')
        ->and(AuditLog::where(['entity_id' => $product->id, 'action' => 'updated'])->exists())->toBeFalse();
});

// ─── Image-replacement cleanup (old − new diff) ──────────────────────────────

test('replacing images deletes only removed assets — kept and new ones survive', function () {
    $assetA = Asset::factory()->create();
    $assetB = Asset::factory()->create();
    $assetC = Asset::factory()->create();

    // Mock emulates FileUploadService.delete()'s DB effect (asset row removed)
    // without touching Storage; call count and target are verified exactly.
    $deletedIds = collect();
    $files = $this->mock(FileUploadService::class);
    $files->shouldReceive('delete')->once()->andReturnUsing(function (Asset $asset) use ($deletedIds): bool {
        $deletedIds[] = $asset->id;
        $asset->delete();

        return true;
    });

    $product = productService()->createProduct([
        'name' => 'Diff Cleanup',
        'sku' => 'DIFF-1',
        'price' => 100,
        'image_asset_ids' => [$assetA->id, $assetB->id], // old = [A, B]
    ]);

    productService()->updateProduct($product->fresh(), [
        'image_asset_ids' => [$assetB->id, $assetC->id], // new = [B, C]
    ]);

    // Exactly A was cleaned up; B persisted across the update; C is brand new.
    expect($deletedIds->all())->toBe([$assetA->id])
        ->and(Asset::find($assetA->id))->toBeNull()
        ->and(Asset::find($assetB->id))->not->toBeNull()
        ->and(Asset::find($assetC->id))->not->toBeNull();

    // Gallery reflects the new ordered set.
    expect($product->fresh()->images()->orderBy('display_order')->pluck('asset_id')->all())
        ->toBe([$assetB->id, $assetC->id]);
});

// ─── Batch category lookup ───────────────────────────────────────────────────

test('findCategoriesByIds returns exactly the requested existing categories', function () {
    $service = app(CategoryService::class);
    $one = Category::factory()->create();
    Category::factory()->create(); // decoy
    $three = Category::factory()->create();

    $found = $service->findCategoriesByIds([$one->id, $three->id]);

    expect($found->pluck('id')->sort()->values()->all())->toBe(
        collect([$one->id, $three->id])->sort()->values()->all()
    )->and($found)->toHaveCount(2)
        ->and($service->findCategoriesByIds([]))->toHaveCount(0);
});

test('assertCategoriesExist reports ALL missing ids in one message', function () {
    $valid = Category::factory()->create();

    try {
        productService()->createProduct([
            'name' => 'Multi Missing',
            'sku' => 'MISS-1',
            'price' => 100,
            'category_ids' => [$valid->id, 111111, 222222],
        ]);
        $this->fail('Expected ProductValidationException was not thrown.');
    } catch (ProductValidationException $e) {
        // Exact match proves BOTH missing IDs are listed and the valid one is not.
        expect($e->getMessage())->toBe('Invalid category ID(s) in category_ids: 111111, 222222.');
    }
});
