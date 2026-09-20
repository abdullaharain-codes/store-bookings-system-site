<?php

use App\Models\Asset;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ─── Listing ────────────────────────────────────────────────────────────────

test('public product index returns only published products in a paginator envelope', function () {
    Product::factory()->published()->count(2)->create();
    Product::factory()->count(3)->create(); // unpublished — must stay hidden

    $response = $this->getJson('/api/v1/products');

    // Same standard paginator shape as every other list endpoint.
    $response->assertOk()
        ->assertJsonStructure([
            'data',
            'links',
            'current_page',
            'total',
            'per_page',
        ]);

    expect($response->json('total'))->toBe(2)
        ->and(collect($response->json('data'))->every(fn ($p) => $p['is_published'] === true))->toBeTrue();
});

test('public index filters by brand_id, search and sort', function () {
    $dell = Brand::factory()->create(['name' => 'Dell']);
    $hp = Brand::factory()->create(['name' => 'HP']);

    Product::factory()->published()->forBrand($dell)->create(['name' => 'Latitude', 'sku' => 'LAT-1', 'price' => 200000]);
    Product::factory()->published()->forBrand($hp)->create(['name' => 'EliteBook', 'sku' => 'ELT-1', 'price' => 150000]);
    Product::factory()->published()->create(['name' => 'Latitude Mouse', 'sku' => 'LM-1', 'price' => 2500]);

    $byBrand = $this->getJson("/api/v1/products?brand_id={$dell->id}");
    expect($byBrand->json('total'))->toBe(1)
        ->and($byBrand->json('data.0.name'))->toBe('Latitude');

    $searched = $this->getJson('/api/v1/products?search=ELT');
    expect($searched->json('total'))->toBe(1)
        ->and($searched->json('data.0.name'))->toBe('EliteBook');

    $cheapestFirst = $this->getJson('/api/v1/products?sort=price_asc');
    expect(collect($cheapestFirst->json('data'))->pluck('price')->all())
        ->toBe(['2500.00', '150000.00', '200000.00']);
});

test('?category_id on a parent category includes products assigned only to its child', function () {
    $parent = Category::factory()->create();
    $child = Category::factory()->create(['parent_category_id' => $parent->id]);

    $childOnlyProduct = Product::factory()->published()->create();
    $childOnlyProduct->categories()->sync([$child->id]);

    $sibling = Product::factory()->published()->create();

    // Parent scope widens: the child-assigned product is found via ?category_id=parent.
    $viaParent = $this->getJson("/api/v1/products?category_id={$parent->id}");
    expect($viaParent->json('total'))->toBe(1)
        ->and($viaParent->json('data.0.id'))->toBe($childOnlyProduct->id);

    // Direct child lookup finds it too.
    $viaChild = $this->getJson("/api/v1/products?category_id={$child->id}");
    expect($viaChild->json('total'))->toBe(1);

    // Unrelated published product never leaks into either query.
    expect($sibling->fresh())->not->toBeNull()
        ->and($this->getJson('/api/v1/products')->json('total'))->toBe(2);
});

test('pagination works over HTTP with ?page=', function () {
    Product::factory()->published()->count(3)->create();

    $page1 = $this->getJson('/api/v1/products?per_page=2');
    expect($page1->json('current_page'))->toBe(1)
        ->and(count($page1->json('data')))->toBe(2)
        ->and($page1->json('total'))->toBe(3);

    $page2 = $this->getJson('/api/v1/products?per_page=2&page=2');
    expect($page2->json('current_page'))->toBe(2)
        ->and(count($page2->json('data')))->toBe(1);
});

// ─── Detail ─────────────────────────────────────────────────────────────────

test('public product show returns the product with relations eager-loaded', function () {
    $brand = Brand::factory()->create(['name' => 'Logitech']);
    $category = Category::factory()->create(['name' => 'Peripherals']);
    $asset = Asset::factory()->create();

    $product = Product::factory()->published()->forBrand($brand)->create();
    $product->categories()->sync([$category->id]);
    $product->images()->create([
        'asset_id' => $asset->id,
        'display_order' => 0,
    ]);

    $response = $this->getJson("/api/v1/products/{$product->slug}");

    $response->assertOk()
        ->assertJsonPath('product.slug', $product->slug)
        ->assertJsonPath('product.brand.name', 'Logitech');

    expect($response->json('product.categories.0.name'))->toBe('Peripherals')
        ->and($response->json('product.images.0.asset.id'))->toBe($asset->id);
});

test('unpublished and missing slugs return the identical 404 body (IDOR-safe)', function () {
    $hidden = Product::factory()->create(); // unpublished

    $missingResponse = $this->getJson('/api/v1/products/does-not-exist');
    $hiddenResponse = $this->getJson("/api/v1/products/{$hidden->slug}");

    $missingResponse->assertStatus(404);
    $hiddenResponse->assertStatus(404);

    // Identical payloads prove nothing is leaked about existence. (Compared
    // via the message field: with APP_DEBUG on in tests, raw bodies embed
    // stack traces that differ by call site — same convention as the
    // Taxonomy IDOR tests.)
    expect($hiddenResponse->json('message'))->toBe($missingResponse->json('message'));
});

test('a freshly published product appears immediately in public listings', function () {
    $product = Product::factory()->create(); // starts unpublished
    expect($this->getJson('/api/v1/products')->json('total'))->toBe(0);

    // Publish through the real admin endpoint.
    $admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->actingAs($admin)
        ->postJson("/api/v1/admin/products/{$product->id}/publish")
        ->assertOk();

    expect($this->getJson('/api/v1/products')->json('total'))->toBe(1)
        ->and($this->getJson("/api/v1/products/{$product->slug}")->status())->toBe(200);
});
