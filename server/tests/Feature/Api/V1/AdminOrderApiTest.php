<?php

use App\Models\Address;
use App\Models\Order;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    // Create orders via direct model operations (no HTTP calls) to avoid
    // session-state pollution from test()->actingAs().  When actAs() is
    // used with session-based SPA auth, it sets session-authenticated
    // state that persists across subsequent requests within the same
    // test — causing auth:sanctum to see an authenticated user where
    // none should exist, and the admin middleware returning 403 instead
    // of the correct 401 for unauthenticated guests.
    $this->placeOrder = function (?Product $product = null, int $quantity = 1): Order {
        $product ??= Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
        $address = Address::factory()->create(['user_id' => $this->customer->id]);

        $subtotal = number_format($product->price * $quantity, 2, '.', '');
        $total = number_format((float) $subtotal + 200, 2, '.', '');

        $order = Order::factory()->create([
            'user_id' => $this->customer->id,
            'address_id' => $address->id,
            'recipient_name' => $address->recipient_name,
            'phone' => $address->phone,
            'address_line_1' => $address->address_line_1,
            'city' => $address->city,
            'subtotal' => $subtotal,
            'shipping_fee' => '200.00',
            'total' => $total,
            'status' => 'pending',
            'payment_status' => 'pending',
        ]);

        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => number_format($product->price, 2, '.', ''),
            'quantity' => $quantity,
            'line_total' => $subtotal,
        ]);

        // Deduct stock directly, mirroring what placeOrder() does.
        $product->decrement('stock_quantity', $quantity);

        return $order->load('items');
    };
});

// ─── Authorization ──────────────────────────────────────────────────────────

test('guest gets 401 on every admin order endpoint', function () {
    $order = ($this->placeOrder)();

    $endpoints = [
        ['getJson', '/api/v1/admin/orders'],
        ['getJson', "/api/v1/admin/orders/{$order->id}"],
        ['patchJson', "/api/v1/admin/orders/{$order->id}/status", ['status' => 'confirmed']],
    ];

    foreach ($endpoints as $endpoint) {
        [$method, $uri] = $endpoint;
        $payload = $endpoint[2] ?? [];
        $this->{$method}($uri, $payload)->assertStatus(401);
    }
});

test('customer gets 403 on every admin order endpoint', function () {
    $order = ($this->placeOrder)();

    $endpoints = [
        ['getJson', '/api/v1/admin/orders'],
        ['getJson', "/api/v1/admin/orders/{$order->id}"],
        ['patchJson', "/api/v1/admin/orders/{$order->id}/status", ['status' => 'confirmed']],
    ];

    foreach ($endpoints as $endpoint) {
        [$method, $uri] = $endpoint;
        $payload = $endpoint[2] ?? [];
        $this->actingAs($this->customer)->{$method}($uri, $payload)->assertStatus(403);
    }
});

// ─── GET /admin/orders (index) ──────────────────────────────────────────────

test('admin can list all orders', function () {
    ($this->placeOrder)();
    ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/orders');

    $response->assertOk()
        ->assertJsonPath('orders.total', 2);
});

test('admin can filter orders by status', function () {
    $orderA = ($this->placeOrder)();
    ($this->placeOrder)();

    $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$orderA->id}/status", [
        'status' => 'confirmed',
    ]);

    $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/orders?status=pending');

    $response->assertOk()
        ->assertJsonPath('orders.total', 1)
        ->assertJsonCount(1, 'orders.data');
});

test('admin can filter orders by user_id', function () {
    ($this->placeOrder)();
    ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->getJson("/api/v1/admin/orders?user_id={$this->customer->id}");

    $response->assertOk()
        ->assertJsonPath('orders.total', 2);
});

test('admin can filter orders by order_number (partial match)', function () {
    $order = ($this->placeOrder)();
    $partial = substr($order->order_number, 0, 8);

    $response = $this->actingAs($this->admin)->getJson("/api/v1/admin/orders?order_number={$partial}");

    $response->assertOk()
        ->assertJsonPath('orders.total', 1);
});

// ─── GET /admin/orders/{order} (show) ──────────────────────────────────────

test('admin can view any order detail with items', function () {
    $order = ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->getJson("/api/v1/admin/orders/{$order->id}");

    $response->assertOk()
        ->assertJsonPath('order.id', $order->id)
        ->assertJsonStructure(['order' => ['items']]);
});

// ─── PATCH /admin/orders/{order}/status (updateStatus) ─────────────────────

test('admin can transition order through valid path via HTTP', function () {
    $order = ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'confirmed',
    ]);
    $response->assertOk()
        ->assertJsonPath('order.status', 'confirmed');

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'shipped',
    ]);
    $response->assertOk()
        ->assertJsonPath('order.status', 'shipped');

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'delivered',
    ]);
    $response->assertOk()
        ->assertJsonPath('order.status', 'delivered')
        ->assertJsonPath('order.payment_status', 'paid');
});

test('admin cancelling via status endpoint correctly restores stock', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $order = ($this->placeOrder)($product, 3);

    $product->refresh();
    expect($product->stock_quantity)->toBe(7);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'cancelled',
    ]);

    $response->assertOk()
        ->assertJsonPath('order.status', 'cancelled');

    $product->refresh();
    expect($product->stock_quantity)->toBe(10);
});

test('invalid transition returns 422 with service message', function () {
    $order = ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'delivered',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Cannot transition from "pending" to "delivered".');
});

test('admin can cancel a shipped order (wider cancellation window)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $order = ($this->placeOrder)($product, 2);

    $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'confirmed',
    ]);
    $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'shipped',
    ]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'cancelled',
    ]);

    $response->assertOk()
        ->assertJsonPath('order.status', 'cancelled');

    $product->refresh();
    expect($product->stock_quantity)->toBe(10);
});

test('admin cannot cancel a delivered order via HTTP', function () {
    $order = ($this->placeOrder)();

    $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'confirmed',
    ]);
    $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'shipped',
    ]);
    $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'delivered',
    ]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'cancelled',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Cannot cancel a delivered order. Please contact support.');
});

test('update status validates status field is required', function () {
    $order = ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['status']);
});

test('update status rejects invalid status value', function () {
    $order = ($this->placeOrder)();

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/orders/{$order->id}/status", [
        'status' => 'bogus',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['status']);
});
