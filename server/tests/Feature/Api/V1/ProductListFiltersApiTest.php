<?php

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ─── min_price / max_price ──────────────────────────────────────────────────

test('min_price filters to the selling price inclusive', function () {
    Product::factory()->published()->create(['name' => 'Cheap', 'price' => 1000.00]);
    Product::factory()->published()->create(['name' => 'Mid', 'price' => 5000.00]);
    Product::factory()->published()->create(['name' => 'Costly', 'price' => 9000.00]);

    $response = $this->getJson('/api/v1/products?min_price=5000');

    expect($response->json('total'))->toBe(2)
        ->and(collect($response->json('data'))->pluck('name')->sort()->values()->all())->toBe(['Costly', 'Mid']);
});

test('max_price filters to the selling price inclusive', function () {
    Product::factory()->published()->create(['name' => 'Cheap', 'price' => 1000.00]);
    Product::factory()->published()->create(['name' => 'Mid', 'price' => 5000.00]);
    Product::factory()->published()->create(['name' => 'Costly', 'price' => 9000.00]);

    $response = $this->getJson('/api/v1/products?max_price=5000');

    expect($response->json('total'))->toBe(2)
        ->and(collect($response->json('data'))->pluck('name')->sort()->values()->all())->toBe(['Cheap', 'Mid']);
});

test('min_price and max_price together bound the range inclusively', function () {
    Product::factory()->published()->create(['price' => 1000.00]);
    Product::factory()->published()->create(['price' => 5000.00]);
    Product::factory()->published()->create(['price' => 9000.00]);

    $response = $this->getJson('/api/v1/products?min_price=5000&max_price=9000');

    expect($response->json('total'))->toBe(2)
        ->and(collect($response->json('data'))->pluck('price')->sort()->values()->all())->toBe(['5000.00', '9000.00']);
});

test('exact boundary prices are included', function () {
    Product::factory()->published()->create(['price' => 1234.56]);
    Product::factory()->published()->create(['price' => 5678.90]);

    $response = $this->getJson('/api/v1/products?min_price=1234.56&max_price=1234.56');

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.price'))->toBe('1234.56');
});

test('max_price below min_price is a 422 with a field error', function () {
    $this->getJson('/api/v1/products?min_price=9000&max_price=5000')
        ->assertStatus(422)
        ->assertJsonValidationErrors('max_price');
});

test('junk min_price and max_price are 422s with field errors', function () {
    $this->getJson('/api/v1/products?min_price=abc')->assertStatus(422)->assertJsonValidationErrors('min_price');
    $this->getJson('/api/v1/products?max_price=abc')->assertStatus(422)->assertJsonValidationErrors('max_price');
    $this->getJson('/api/v1/products?min_price=-10')->assertStatus(422)->assertJsonValidationErrors('min_price');
});

test('empty min_price is treated as absent', function () {
    Product::factory()->published()->count(3)->create(['price' => 2000.00]);

    $response = $this->getJson('/api/v1/products?min_price=');

    expect($response->json('total'))->toBe(3);
});

// ─── in_stock: available stock is stock_quantity minus active cart holds ─────
// StockHoldService::availableStock() is the concept (stock_quantity minus the
// SUM of unexpired cart_item holds), mirrored here as the filter predicate.

test('in_stock=1 returns only products with available stock', function () {
    $buyer = User::factory()->create();
    $inStock = Product::factory()->published()->create(['name' => 'Have stock', 'stock_quantity' => 5]);
    Product::factory()->published()->create(['name' => 'Empty', 'stock_quantity' => 0]);
    $fullyHeld = Product::factory()->published()->create(['name' => 'Held out', 'stock_quantity' => 5]);

    $this->actingAs($buyer)->postJson('/api/v1/cart/items', [
        'product_id' => $fullyHeld->id,
        'quantity' => 5,
    ])->assertCreated();

    $response = $this->getJson('/api/v1/products?in_stock=1');

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.id'))->toBe($inStock->id);
});

test('in_stock=0 returns only products with no available stock', function () {
    $buyer = User::factory()->create();
    Product::factory()->published()->create(['name' => 'Have stock', 'stock_quantity' => 5]);
    Product::factory()->published()->create(['name' => 'Empty', 'stock_quantity' => 0]);
    Product::factory()->published()->create(['name' => 'Held out', 'stock_quantity' => 5]);

    $this->actingAs($buyer)->postJson('/api/v1/cart/items', [
        'product_id' => Product::query()->where('name', 'Held out')->first()->id,
        'quantity' => 5,
    ])->assertCreated();

    $response = $this->getJson('/api/v1/products?in_stock=0');

    expect($response->json('total'))->toBe(2)
        ->and(collect($response->json('data'))->pluck('name')->sort()->values()->all())->toBe(['Empty', 'Held out']);
});

test('in_stock boolean formats 1, 0, true and false all work', function () {
    Product::factory()->published()->create(['name' => 'Have stock', 'stock_quantity' => 5]);
    Product::factory()->published()->create(['name' => 'Empty', 'stock_quantity' => 0]);

    expect($this->getJson('/api/v1/products?in_stock=true')->json('total'))->toBe(1)
        ->and($this->getJson('/api/v1/products?in_stock=0')->json('total'))->toBe(1)
        ->and($this->getJson('/api/v1/products?in_stock=false')->json('total'))->toBe(1);
});

test('junk in_stock and an empty in_stock stay safe', function () {
    Product::factory()->published()->count(2)->create(['stock_quantity' => 3]);

    $this->getJson('/api/v1/products?in_stock=abc')->assertStatus(422)->assertJsonValidationErrors('in_stock');

    // `?in_stock=` with nothing after it means "no filter", like ?featured=.
    $response = $this->getJson('/api/v1/products?in_stock=');
    expect($response->json('total'))->toBe(2);
});

// ─── composition and visibility ──────────────────────────────────────────────

test('filters compose with category_id (subcategory scope), brand_id and search', function () {
    $parent = Category::factory()->create();
    $child = Category::factory()->create(['parent_category_id' => $parent->id]);
    $brand = Brand::factory()->create(['name' => 'Target Brand']);

    $target = Product::factory()->published()->forBrand($brand)->create([
        'name' => 'Target Product', 'sku' => 'TGT-1', 'price' => 6000.00, 'stock_quantity' => 5,
    ]);
    $target->categories()->sync([$child->id]);

    // Same brand, different price band → excluded by range.
    $otherBrand = Product::factory()->published()->forBrand($brand)->create(['price' => 30000.00]);
    $otherBrand->categories()->sync([$child->id]);

    // In range and branded, but not in the subcategory scope.
    Product::factory()->published()->forBrand($brand)->create(['name' => 'Target Product', 'price' => 6000.00]);

    // In range, right brand/name, but out of stock.
    $outOfStock = Product::factory()->published()->forBrand($brand)->create([
        'name' => 'Target Product', 'sku' => 'TGT-2', 'price' => 6000.00, 'stock_quantity' => 0,
    ]);
    $outOfStock->categories()->sync([$child->id]);

    $response = $this->getJson(
        "/api/v1/products?category_id={$parent->id}&brand_id={$brand->id}&search=Target&min_price=5000&max_price=10000&in_stock=1",
    );

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.id'))->toBe($target->id);
});

test('unpublished products never leak through any filter combination', function () {
    $brand = Brand::factory()->create(['name' => 'Hidden Brand']);

    Product::factory()->create([
        'name' => 'Secret Squirrel', 'sku' => 'SEC-1', 'price' => 3000.00,
        'stock_quantity' => 5, 'brand_id' => $brand->id, 'is_published' => false,
    ]);

    $response = $this->getJson(
        "/api/v1/products?min_price=1000&max_price=5000&in_stock=1&brand_id={$brand->id}&search=Squirrel",
    );

    expect($response->json('total'))->toBe(0);
});

// ─── per_page cap (1..48) ────────────────────────────────────────────────────

test('per_page=1000 is clamped down to 48', function () {
    Product::factory()->published()->count(50)->create(['price' => 1000.00, 'stock_quantity' => 1]);

    $response = $this->getJson('/api/v1/products?per_page=1000');

    expect($response->json('per_page'))->toBe(48)
        ->and($response->json('total'))->toBe(50)
        ->and(count($response->json('data')))->toBe(48);
});

test('per_page=0 and negative per_page fall back to the default of 15', function () {
    Product::factory()->published()->count(20)->create(['price' => 1000.00, 'stock_quantity' => 1]);

    $zero = $this->getJson('/api/v1/products?per_page=0');
    $negative = $this->getJson('/api/v1/products?per_page=-3');

    expect($zero->json('per_page'))->toBe(15)
        ->and(count($zero->json('data')))->toBe(15)
        ->and($negative->json('per_page'))->toBe(15);
});

test('services list shares the same per_page cap', function () {
    Service::factory()->count(3)->create(['is_published' => true]);

    $clamped = $this->getJson('/api/v1/services?per_page=1000');
    expect($clamped->json('per_page'))->toBe(48);

    $normal = $this->getJson('/api/v1/services?per_page=2');
    expect($normal->json('per_page'))->toBe(2);
});
