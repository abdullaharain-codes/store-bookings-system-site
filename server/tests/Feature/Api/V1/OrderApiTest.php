<?php

use App\Models\Address;
use App\Models\Cart;
use App\Models\CartItem;
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

test('guest gets 401 on every order endpoint', function () {
    $this->postJson('/api/v1/orders', [])->assertStatus(401);
    $this->getJson('/api/v1/orders')->assertStatus(401);
    $this->getJson('/api/v1/orders/1')->assertStatus(401);
});

// ─── POST /orders (place order) ────────────────────────────────────────────

test('authenticated user can place an order', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 1500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    // Add to cart via the service (we're testing the HTTP layer, not the cart flow).
    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ])->assertCreated();

    $response = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $response->assertCreated()
        ->assertJsonStructure([
            'order' => [
                'id', 'order_number', 'subtotal', 'shipping_fee', 'total',
                'status', 'payment_status',
                'recipient_name', 'phone', 'city',
                'items' => [
                    ['product_name', 'product_sku', 'unit_price', 'quantity', 'line_total'],
                ],
            ],
        ])
        ->assertJsonPath('order.subtotal', '3000.00')
        ->assertJsonPath('order.shipping_fee', '200.00')
        ->assertJsonPath('order.total', '3200.00')
        ->assertJsonPath('order.status', 'pending')
        ->assertJsonPath('order.payment_status', 'pending')
        ->assertJsonPath('order.items.0.quantity', 2);

    // Stock deducted.
    $product->refresh();
    expect($product->stock_quantity)->toBe(8);

    // Cart cleared.
    $this->assertDatabaseCount('cart_items', 0);
});

test('place order with empty cart returns 422', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Cannot place an order with an empty cart.');
});

test('place order with expired hold returns 422', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);
    $cart = Cart::factory()->create(['user_id' => $this->user->id]);

    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 2,
        'hold_expires_at' => now()->subMinutes(5),
    ]);

    $response = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', '"'.$product->name.'" is no longer reserved. Please re-add it to your cart.');
});

test('place order validates address_id is required', function () {
    $response = $this->actingAs($this->user)->postJson('/api/v1/orders', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['address_id']);
});

test('place order rejects another users address (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $otherAddress = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ])->assertCreated();

    $response = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $otherAddress->id,
    ]);

    $response->assertStatus(404);
});

// ─── GET /orders (list) ────────────────────────────────────────────────────

test('authenticated user sees only their orders', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 100, 'is_published' => true]);
    $addressA = Address::factory()->create(['user_id' => $this->user->id]);
    $addressB = Address::factory()->create(['user_id' => $this->otherUser->id]);

    // User A places an order.
    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 1,
    ]);
    $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $addressA->id,
    ]);

    // User B places an order.
    $this->actingAs($this->otherUser)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 1,
    ]);
    $this->actingAs($this->otherUser)->postJson('/api/v1/orders', [
        'address_id' => $addressB->id,
    ]);

    $response = $this->actingAs($this->user)->getJson('/api/v1/orders');

    $response->assertOk()
        ->assertJsonPath('orders.total', 1)
        ->assertJsonCount(1, 'orders.data');
});

// ─── GET /orders/{order} (show) ────────────────────────────────────────────

test('authenticated user can view their order detail', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 800, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 2,
    ]);
    $placeResponse = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $orderId = $placeResponse->json('order.id');

    $response = $this->actingAs($this->user)->getJson("/api/v1/orders/{$orderId}");

    $response->assertOk()
        ->assertJsonPath('order.id', $orderId)
        ->assertJsonStructure(['order' => ['items']]);
});

test('user cannot view another users order (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 800, 'is_published' => true]);
    $addressA = Address::factory()->create(['user_id' => $this->user->id]);
    $addressB = Address::factory()->create(['user_id' => $this->otherUser->id]);

    // User A places an order.
    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 1,
    ]);
    $placeResponse = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $addressA->id,
    ]);
    $orderId = $placeResponse->json('order.id');

    // User B tries to view User A's order.
    $response = $this->actingAs($this->otherUser)->getJson("/api/v1/orders/{$orderId}");

    $response->assertStatus(404);
});

test('order show 404 is indistinguishable from a genuinely-missing order', function () {
    $response = $this->actingAs($this->user)->getJson('/api/v1/orders/999999');

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');
});

// ─── POST /orders/{order}/cancel (customer cancel) ─────────────────────────

test('customer can cancel their own pending order', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 3,
    ])->assertCreated();

    $placeResponse = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ])->assertCreated();

    $orderId = $placeResponse->json('order.id');

    $product->refresh();
    expect($product->stock_quantity)->toBe(7);

    $response = $this->actingAs($this->user)->postJson("/api/v1/orders/{$orderId}/cancel");

    $response->assertOk()
        ->assertJsonPath('order.status', 'cancelled');

    $product->refresh();
    expect($product->stock_quantity)->toBe(10);
});

test('customer cannot cancel a confirmed order via HTTP', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 1,
    ]);

    $placeResponse = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $orderId = $placeResponse->json('order.id');

    // Admin transitions to confirmed
    $admin = User::factory()->create(['role_id' => Role::where('slug', 'admin')->first()->id]);
    $this->actingAs($admin)->patchJson("/api/v1/admin/orders/{$orderId}/status", [
        'status' => 'confirmed',
    ]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/orders/{$orderId}/cancel");

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Only pending orders can be cancelled. Please contact support.');
});

test('customer cannot cancel another users order via HTTP (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id, 'quantity' => 1,
    ]);

    $placeResponse = $this->actingAs($this->user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $orderId = $placeResponse->json('order.id');

    $response = $this->actingAs($this->otherUser)->postJson("/api/v1/orders/{$orderId}/cancel");

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');
});
