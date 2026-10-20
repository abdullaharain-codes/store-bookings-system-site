<?php

use App\Models\Asset;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Authorization ──────────────────────────────────────────────────────────

test('guest gets 401 on every wishlist endpoint', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    $this->getJson('/api/v1/wishlist')->assertStatus(401);
    $this->postJson("/api/v1/wishlist/{$product->id}")->assertStatus(401);
});

// ─── GET /wishlist ──────────────────────────────────────────────────────────

test('authenticated user gets an empty wishlist initially', function () {
    $response = $this->actingAs($this->user)->getJson('/api/v1/wishlist');

    $response->assertOk()
        ->assertJsonPath('wishlist', []);
});

test('authenticated user sees their wishlisted products', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}")
        ->assertOk()
        ->assertJsonPath('is_wishlisted', true);

    $response = $this->actingAs($this->user)->getJson('/api/v1/wishlist');

    $response->assertOk()
        ->assertJsonCount(1, 'wishlist')
        ->assertJsonPath('wishlist.0.product.id', $product->id);
});

test('wishlist returns the product with its full eager-loaded shape', function () {
    $brand = Brand::factory()->create(['name' => 'Logitech']);
    $category = Category::factory()->create(['name' => 'Peripherals']);
    $asset = Asset::factory()->create();

    $product = Product::factory()->published()->forBrand($brand)->create();
    $product->categories()->sync([$category->id]);
    $product->images()->create([
        'asset_id' => $asset->id,
        'display_order' => 0,
    ]);

    $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}")
        ->assertOk()
        ->assertJsonPath('is_wishlisted', true);

    $response = $this->actingAs($this->user)->getJson('/api/v1/wishlist');

    $response->assertOk()
        ->assertJsonCount(1, 'wishlist')
        ->assertJsonPath('wishlist.0.product.id', $product->id)
        ->assertJsonPath('wishlist.0.product.brand.name', 'Logitech');

    expect($response->json('wishlist.0.product.categories.0.id'))->toBe($category->id)
        ->and($response->json('wishlist.0.product.images.0.asset.path'))->toBe($asset->path);
});

// ─── POST /wishlist/{product} ───────────────────────────────────────────────

test('toggle adds a product to the wishlist', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}");

    $response->assertOk()
        ->assertJsonPath('is_wishlisted', true);

    $this->assertDatabaseHas('wishlists', [
        'user_id' => $this->user->id,
        'product_id' => $product->id,
    ]);
});

test('toggle removes a previously wishlisted product', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    // Add.
    $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}")
        ->assertOk()
        ->assertJsonPath('is_wishlisted', true);

    // Remove.
    $response = $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}");

    $response->assertOk()
        ->assertJsonPath('is_wishlisted', false);

    $this->assertDatabaseMissing('wishlists', [
        'user_id' => $this->user->id,
        'product_id' => $product->id,
    ]);
});

test('toggle does not affect other users wishlists', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    // Both users add.
    $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}")->assertOk();
    $this->actingAs($this->otherUser)->postJson("/api/v1/wishlist/{$product->id}")->assertOk();

    // User removes — other user's should stay.
    $this->actingAs($this->user)->postJson("/api/v1/wishlist/{$product->id}")
        ->assertOk()
        ->assertJsonPath('is_wishlisted', false);

    $this->assertDatabaseHas('wishlists', [
        'user_id' => $this->otherUser->id,
        'product_id' => $product->id,
    ]);
});

test('toggle returns 404 for non-existent product', function () {
    $response = $this->actingAs($this->user)->postJson('/api/v1/wishlist/999999');

    $response->assertStatus(404);
});
