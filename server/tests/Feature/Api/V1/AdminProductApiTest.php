<?php

use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Authorization ───────────────────────────────────────────────────────────

test('guest gets 401 on every admin product endpoint', function () {
    $product = Product::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/products', []],
        ['postJson', '/api/v1/admin/products', ['name' => 'X']],
        ['getJson', "/api/v1/admin/products/{$product->id}"],
        ['putJson', "/api/v1/admin/products/{$product->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/products/{$product->id}"],
        ['postJson', "/api/v1/admin/products/{$product->id}/publish"],
        ['postJson', "/api/v1/admin/products/{$product->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->{$method}($uri)->assertStatus(401);
    }
});

test('customer gets 403 on every admin product endpoint', function () {
    $product = Product::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/products', []],
        ['postJson', '/api/v1/admin/products', ['name' => 'X']],
        ['getJson', "/api/v1/admin/products/{$product->id}"],
        ['putJson', "/api/v1/admin/products/{$product->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/products/{$product->id}"],
        ['postJson', "/api/v1/admin/products/{$product->id}/publish"],
        ['postJson', "/api/v1/admin/products/{$product->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->actingAs($this->customer)->{$method}($uri, [])->assertStatus(403);
    }
});

// ─── Listing ────────────────────────────────────────────────────────────────

test('admin can list products with pagination envelope, including unpublished', function () {
    Product::factory()->count(2)->create();
    Product::factory()->published()->create();

    $response = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/products');

    // Standard Laravel paginator shape — the frontend reads .data + meta.
    $response->assertOk()
        ->assertJsonStructure([
            'data',
            'links',
            'current_page',
            'total',
            'per_page',
        ]);

    expect($response->json('total'))->toBe(3);
});

test('admin can filter products by search, status and brand_id', function () {
    $brand = Brand::factory()->create(['name' => 'Dell']);

    Product::factory()->create(['name' => 'Latitude Laptop', 'sku' => 'LAT-1']);
    Product::factory()->published()->forBrand($brand)->create(['name' => 'XPS Laptop']);
    Product::factory()->create(['name' => 'Office Mouse']);

    $searched = $this->actingAs($this->admin)->getJson('/api/v1/admin/products?search=laptop');
    expect($searched->json('total'))->toBe(2);

    $publishedOnly = $this->actingAs($this->admin)->getJson('/api/v1/admin/products?status=published');
    expect($publishedOnly->json('total'))->toBe(1)
        ->and($publishedOnly->json('data.0.name'))->toBe('XPS Laptop');

    $byBrand = $this->actingAs($this->admin)->getJson("/api/v1/admin/products?brand_id={$brand->id}");
    expect($byBrand->json('total'))->toBe(1)
        ->and($byBrand->json('data.0.name'))->toBe('XPS Laptop');
});

// ─── Create ─────────────────────────────────────────────────────────────────

test('admin can create a product with auto-generated slug and defaults', function () {
    $category = Category::factory()->create();

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/products', [
            'name' => 'Mechanical Keyboard',
            'sku' => 'KB-001',
            'price' => 8500.5,
            'description' => 'Tenkeyless board',
            'stock_quantity' => 12,
            'category_ids' => [$category->id],
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('product.name', 'Mechanical Keyboard')
        ->assertJsonPath('product.slug', 'mechanical-keyboard')
        ->assertJsonPath('product.sku', 'KB-001')
        ->assertJsonPath('product.is_published', false);

    $this->assertDatabaseHas('products', [
        'slug' => 'mechanical-keyboard',
        'is_published' => false,
    ]);

    expect(DB::table('product_category')
        ->where('product_id', $response->json('product.id'))
        ->where('category_id', $category->id)
        ->exists())->toBeTrue()
        ->and(AuditLog::where([
            ['entity', 'Product'],
            ['action', 'created'],
            ['entity_id', $response->json('product.id')],
        ])->exists())->toBeTrue();
});

test('admin can create a product with an ordered image gallery', function () {
    $assets = Asset::factory()->count(2)->create();

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/products', [
            'name' => 'Gallery Phone',
            'sku' => 'PH-001',
            'price' => 100000,
            'image_asset_ids' => [$assets[1]->id, $assets[0]->id],
        ]);

    $gallery = ProductImage::where('product_id', $response->json('product.id'))
        ->orderBy('display_order')
        ->pluck('asset_id');

    expect($gallery->all())->toBe([$assets[1]->id, $assets[0]->id]);
});

test('duplicate explicit slug and duplicate sku are rejected with 422', function () {
    Product::factory()->create(['slug' => 'taken-slug', 'sku' => 'TAKEN-1']);

    // Note: the FormRequest enforces the spec's strict lowercase-hyphen slug
    // format BEFORE the service sees the value, so the colliding slug must
    // arrive already well-formed (service-side normalization of loose input
    // is covered by ProductServiceTest).
    $slugClash = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/products', [
            'name' => 'Other Thing',
            'slug' => 'taken-slug',
            'sku' => 'OTH-1',
            'price' => 10,
        ]);

    $slugClash->assertStatus(422)
        ->assertJsonPath('message', 'The slug "taken-slug" is already in use by another product.');

    $skuClash = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/products', [
            'name' => 'Other Thing',
            'sku' => 'TAKEN-1',
            'price' => 10,
        ]);

    $skuClash->assertStatus(422)
        ->assertJsonPath('message', 'The SKU "TAKEN-1" is already in use by another product.');
});

test('store validation rejects malformed input with field errors', function () {
    $cases = [
        [['sku' => 'V-1', 'price' => 10], 'name'],                        // name missing
        [['name' => 'No Sku', 'price' => 10], 'sku'],                     // sku missing
        [['name' => 'No Price', 'sku' => 'V-2'], 'price'],                // price missing
        [['name' => 'Bad Slug', 'slug' => 'Not A Slug!', 'sku' => 'V-3', 'price' => 10], 'slug'],
        [['name' => 'Neg Price', 'sku' => 'V-4', 'price' => -5], 'price'],
        [['name' => 'Ghost Cat', 'sku' => 'V-5', 'price' => 10, 'category_ids' => [999999]], 'category_ids.0'],
        [['name' => 'Ghost Img', 'sku' => 'V-6', 'price' => 10, 'image_asset_ids' => [999999]], 'image_asset_ids.0'],
        [['name' => 'Ghost Brand', 'sku' => 'V-7', 'price' => 10, 'brand_id' => 999999], 'brand_id'],
    ];

    foreach ($cases as [$payload, $errorKey]) {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/admin/products', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors([$errorKey]);
    }
});

// ─── Update ─────────────────────────────────────────────────────────────────

test('admin can partially update a product without touching other fields', function () {
    $product = Product::factory()->create(['description' => 'Original copy']);

    $response = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['price' => 1234.56]);

    $response->assertOk()
        // decimal:2 cast serializes money as a string — precision-safe JSON.
        ->assertJsonPath('product.price', '1234.56')
        ->assertJsonPath('product.description', 'Original copy');

    expect(AuditLog::where([
        ['entity', 'Product'],
        ['entity_id', $product->id],
        ['action', 'updated'],
    ])->exists())->toBeTrue();
});

test('update replaces the category assignment set', function () {
    $original = Category::factory()->create();
    $replacement = Category::factory()->create();
    $product = Product::factory()->create();

    $product->categories()->sync([$original->id]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['category_ids' => [$replacement->id]])
        ->assertOk();

    expect(DB::table('product_category')->where('product_id', $product->id)->pluck('category_id')->all())
        ->toBe([$replacement->id]);
});

test('update slug collision and sku collision are rejected with 422', function () {
    Product::factory()->create(['slug' => 'occupied', 'sku' => 'OCC-1']);
    $product = Product::factory()->create();

    $slugClash = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['slug' => 'occupied']);

    $slugClash->assertStatus(422)
        ->assertJsonPath('message', 'The slug "occupied" is already in use by another product.');

    $skuClash = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['sku' => 'OCC-1']);

    $skuClash->assertStatus(422)
        ->assertJsonPath('message', 'The SKU "OCC-1" is already in use by another product.');

    // Own slug/sku must NOT collide with itself.
    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", [
            'slug' => $product->slug,
            'sku' => $product->sku,
        ])
        ->assertOk();
});

test('is_published in an update payload never flips publication state', function () {
    $product = Product::factory()->create();

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['name' => 'Renamed', 'is_published' => true])
        ->assertOk()
        ->assertJsonPath('product.is_published', false);

    // No published audit either — transitions belong to publish().
    expect(AuditLog::where('action', 'published')->exists())->toBeFalse();
});

// ─── Publish / unpublish ────────────────────────────────────────────────────

test('publish and unpublish transition state with audit entries', function () {
    $product = Product::factory()->create();

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/products/{$product->id}/publish")
        ->assertOk()
        ->assertJsonPath('product.is_published', true);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/products/{$product->id}/unpublish")
        ->assertOk()
        ->assertJsonPath('product.is_published', false);

    $actions = AuditLog::where(['entity' => 'Product', 'entity_id' => $product->id])
        ->orderBy('id')
        ->pluck('action');

    expect($actions->all())->toBe(['published', 'unpublished'])
        ->and(AuditLog::where('action', 'published')->first()->metadata['previous'])->toBeFalse()
        ->and(AuditLog::where('action', 'unpublished')->first()->metadata['previous'])->toBeTrue();
});

test('publishing an already-published product is idempotent with no extra audit', function () {
    $product = Product::factory()->published()->create();

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/products/{$product->id}/publish")
        ->assertOk()
        ->assertJsonPath('product.is_published', true);

    expect(AuditLog::where(['entity' => 'Product', 'action' => 'published'])->count())->toBe(0);
});

// ─── Delete ─────────────────────────────────────────────────────────────────

test('admin can delete a product; gallery links cascade and audit records it', function () {
    $category = Category::factory()->create();
    $product = Product::factory()->create();
    $product->categories()->sync([$category->id]);

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/products/{$product->id}")
        ->assertOk()
        ->assertJsonPath('message', 'Product deleted.');

    expect(Product::find($product->id))->toBeNull()
        ->and(DB::table('product_category')->where('product_id', $product->id)->count())->toBe(0)
        ->and(AuditLog::where([
            ['entity', 'Product'],
            ['entity_id', $product->id],
            ['action', 'deleted'],
        ])->exists())->toBeTrue();
});
