<?php

use App\Models\Asset;
use App\Models\Brand;
use App\Models\Cart;
use App\Models\CartItem;
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

test('guest gets 401 on every cart endpoint', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $cart = Cart::factory()->create(['user_id' => $this->user->id]);
    $cartItem = CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 1,
        'hold_expires_at' => now()->addMinutes(15),
    ]);

    $this->getJson('/api/v1/cart')->assertStatus(401);
    $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])->assertStatus(401);
    $this->patchJson("/api/v1/cart/items/{$cartItem->id}", ['quantity' => 2])->assertStatus(401);
    $this->deleteJson("/api/v1/cart/items/{$cartItem->id}")->assertStatus(401);
});

// ─── GET /cart ──────────────────────────────────────────────────────────────

test('authenticated user gets an empty cart initially', function () {
    $response = $this->actingAs($this->user)->getJson('/api/v1/cart');

    $response->assertOk()
        ->assertJsonStructure(['cart' => ['id', 'items']]);
});

test('authenticated user sees their cart items with products eager-loaded', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ])->assertCreated();

    $response = $this->actingAs($this->user)->getJson('/api/v1/cart');

    $response->assertOk()
        ->assertJsonPath('cart.items.0.quantity', 2)
        ->assertJsonPath('cart.items.0.product.id', $product->id);
});

test('cart items carry the product with its full eager-loaded shape', function () {
    $brand = Brand::factory()->create(['name' => 'Logitech']);
    $category = Category::factory()->create(['name' => 'Peripherals']);
    $asset = Asset::factory()->create();

    $product = Product::factory()->published()->forBrand($brand)->create(['stock_quantity' => 10]);
    $product->categories()->sync([$category->id]);
    $product->images()->create([
        'asset_id' => $asset->id,
        'display_order' => 0,
    ]);

    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ])->assertCreated();

    $response = $this->actingAs($this->user)->getJson('/api/v1/cart');

    $response->assertOk()
        ->assertJsonPath('cart.items.0.product.brand.name', 'Logitech');

    expect($response->json('cart.items.0.product.categories.0.id'))->toBe($category->id)
        ->and($response->json('cart.items.0.product.images.0.asset.path'))->toBe($asset->path);
});

// ─── POST /cart/items ───────────────────────────────────────────────────────

test('authenticated user can add an item to their cart', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 3,
    ]);

    $response->assertCreated()
        ->assertJsonPath('cart_item.quantity', 3)
        ->assertJsonPath('cart_item.product.id', $product->id)
        ->assertJsonStructure(['cart_item' => ['id', 'hold_expires_at', 'hold_status']]);

    $this->assertDatabaseHas('cart_items', [
        'product_id' => $product->id,
        'quantity' => 3,
    ]);
});

test('add and update cart_item responses carry the product full shape', function () {
    $brand = Brand::factory()->create(['name' => 'Logitech']);
    $category = Category::factory()->create(['name' => 'Peripherals']);
    $asset = Asset::factory()->create();

    $product = Product::factory()->published()->forBrand($brand)->create(['stock_quantity' => 10]);
    $product->categories()->sync([$category->id]);
    $product->images()->create([
        'asset_id' => $asset->id,
        'display_order' => 0,
    ]);

    $added = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ])->assertCreated();

    $cartItemId = $added->json('cart_item.id');

    expect($added->json('cart_item.product.brand.name'))->toBe('Logitech')
        ->and($added->json('cart_item.product.categories.0.id'))->toBe($category->id)
        ->and($added->json('cart_item.product.images.0.asset.path'))->toBe($asset->path);

    $updated = $this->actingAs($this->user)->patchJson("/api/v1/cart/items/{$cartItemId}", [
        'quantity' => 3,
    ])->assertOk();

    expect($updated->json('cart_item.product.brand.name'))->toBe('Logitech')
        ->and($updated->json('cart_item.product.images.0.asset.path'))->toBe($asset->path);
});

test('addItem with hold_status active on fresh add', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ]);

    $response->assertCreated()
        ->assertJsonPath('cart_item.hold_status', 'active');
});

test('add to cart validates required fields', function () {
    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['product_id', 'quantity']);
});

test('add to cart rejects non-existent product via form validation', function () {
    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => 999999,
        'quantity' => 1,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['product_id']);
});

test('add to cart rejects quantity below 1', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 0,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['quantity']);
});

test('add to cart rejects when stock is exhausted', function () {
    $product = Product::factory()->create(['stock_quantity' => 2, 'is_published' => true]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 5,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Only 2 left in stock.');
});

test('add to cart rejects when another user already holds all stock', function () {
    $product = Product::factory()->create(['stock_quantity' => 1, 'is_published' => true]);

    // Other user holds the only unit.
    $otherCart = Cart::factory()->create(['user_id' => $this->otherUser->id]);
    CartItem::factory()->create([
        'cart_id' => $otherCart->id,
        'product_id' => $product->id,
        'quantity' => 1,
        'hold_expires_at' => now()->addMinutes(15),
    ]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Only 0 left in stock.');
});

// ─── PATCH /cart/items/{cartItem} ───────────────────────────────────────────

test('authenticated user can update quantity on their own cart item', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $cartItemId = $addResponse->json('cart_item.id');

    $response = $this->actingAs($this->user)->patchJson("/api/v1/cart/items/{$cartItemId}", [
        'quantity' => 5,
    ]);

    $response->assertOk()
        ->assertJsonPath('cart_item.quantity', 5)
        ->assertJsonPath('message', 'Cart item updated.');
});

test('update to quantity 0 removes the item via delete', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $cartItemId = $addResponse->json('cart_item.id');

    $response = $this->actingAs($this->user)->patchJson("/api/v1/cart/items/{$cartItemId}", [
        'quantity' => 0,
    ]);

    $response->assertOk();

    $this->assertDatabaseMissing('cart_items', ['id' => $cartItemId]);
});

test('update rejects negative quantity', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $cartItemId = $addResponse->json('cart_item.id');

    $response = $this->actingAs($this->user)->patchJson("/api/v1/cart/items/{$cartItemId}", [
        'quantity' => -1,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['quantity']);
});

// ─── DELETE /cart/items/{cartItem} ──────────────────────────────────────────

test('authenticated user can remove their own cart item', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $cartItemId = $addResponse->json('cart_item.id');

    $response = $this->actingAs($this->user)->deleteJson("/api/v1/cart/items/{$cartItemId}");

    $response->assertOk()
        ->assertJsonPath('message', 'Cart item removed.');

    $this->assertDatabaseMissing('cart_items', ['id' => $cartItemId]);
});

test('delete returns 404 for non-existent cart item', function () {
    $response = $this->actingAs($this->user)->deleteJson('/api/v1/cart/items/999999');

    $response->assertStatus(404);
});

// ─── IDOR ───────────────────────────────────────────────────────────────────

test('user cannot update another users cart item (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->otherUser)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $otherCartItem = $addResponse->json('cart_item.id');

    $response = $this->actingAs($this->user)->patchJson("/api/v1/cart/items/{$otherCartItem}", [
        'quantity' => 1,
    ]);

    $response->assertStatus(404);
});

test('user cannot delete another users cart item (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->otherUser)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $otherCartItem = $addResponse->json('cart_item.id');

    $response = $this->actingAs($this->user)->deleteJson("/api/v1/cart/items/{$otherCartItem}");

    $response->assertStatus(404);

    // Confirm the row was NOT deleted.
    $this->assertDatabaseHas('cart_items', ['id' => $otherCartItem]);
});

test('wrong-owner 404 is indistinguishable from a genuinely-missing cart item 404', function () {
    // Same pattern as PublicTaxonomyApiTest/PublicProductApiTest: compare
    // the message field only, because under APP_DEBUG=true the embedded
    // exception trace differs by call-site line.
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $addResponse = $this->actingAs($this->otherUser)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ]);

    $otherCartItemId = $addResponse->json('cart_item.id');

    // Wrong-owner response (resource exists but belongs to otherUser).
    $wrongOwner = $this->actingAs($this->user)->patchJson("/api/v1/cart/items/{$otherCartItemId}", [
        'quantity' => 1,
    ]);

    // Genuinely-missing response (no such ID ever existed).
    $missing = $this->actingAs($this->user)->patchJson('/api/v1/cart/items/999999', [
        'quantity' => 1,
    ]);

    $wrongOwner->assertStatus(404);
    $missing->assertStatus(404);

    // In production (APP_DEBUG=false) the bodies are fully identical; under
    // local debug mode the embedded exception trace differs by test call-site
    // line, so equality is asserted on the user-visible message field.
    expect($wrongOwner->json('message'))->toBe($missing->json('message'));
});

// ─── Expired hold visibility ────────────────────────────────────────────────

test('cart item with expired hold still appears in GET /cart as expired', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    // Create a cart for this user, then directly insert an item with an
    // expired hold (simulates a hold that expired between add and page load).
    $cart = Cart::firstOrCreate(['user_id' => $this->user->id]);

    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 3,
        'hold_expires_at' => now()->subMinutes(5),
    ]);

    $response = $this->actingAs($this->user)->getJson('/api/v1/cart');

    $response->assertOk()
        ->assertJsonPath('cart.items.0.quantity', 3)
        ->assertJsonPath('cart.items.0.hold_status', 'expired')
        ->assertJsonPath('cart.items.0.product.id', $product->id);
});
