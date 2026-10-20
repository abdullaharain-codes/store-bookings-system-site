<?php

use App\Models\Address;
use App\Models\BusinessSetting;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

/**
 * BE5 — the public shipping-fee read.
 *
 * D2 (owner decision): checkout must show the shipping fee BEFORE an order is
 * placed, so the storefront needs a public read of the same flat fee that
 * OrderService stores on the order. This endpoint must be the single source of
 * truth for that value — these tests pin that the endpoint and a placed order
 * read the SAME BusinessSetting through the SAME service, and that no other
 * business setting leaks.
 */
beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
});

// ─── Public access ──────────────────────────────────────────────────────────

test('a guest can read the shipping fee without auth', function () {
    $this->getJson('/api/v1/shipping-fee')
        ->assertOk()
        ->assertJsonPath('shipping_fee', '200.00');
});

test('the fee is a money string equal to the configured BusinessSetting value', function () {
    BusinessSetting::where('key', 'shipping_fee')->update(['value' => '350']);

    $this->getJson('/api/v1/shipping-fee')
        ->assertOk()
        ->assertJsonPath('shipping_fee', '350.00');
});

// ─── Live value, no cache ───────────────────────────────────────────────────

test('an admin changing the setting is reflected immediately (no caching layer)', function () {
    $this->getJson('/api/v1/shipping-fee')->assertJsonPath('shipping_fee', '200.00');

    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => '999'])
        ->assertOk();

    $this->getJson('/api/v1/shipping-fee')
        ->assertOk()
        ->assertJsonPath('shipping_fee', '999.00');
});

// ─── Minimal surface ────────────────────────────────────────────────────────

test('the response exposes exactly one field and no other business setting', function () {
    $response = $this->getJson('/api/v1/shipping-fee')->assertOk();

    $response->assertJsonStructure(['shipping_fee']);
    $response->assertJsonCount(1);

    // None of the other seeded settings may ride along.
    $response->assertJsonMissingPath('email_notifications_enabled')
        ->assertJsonMissingPath('cart_hold_minutes');
});

// ─── Same source of truth as order placement ────────────────────────────────

test('a placed order stores the same fee the endpoint reports', function () {
    // Change the setting once; both readers must see the new value.
    BusinessSetting::where('key', 'shipping_fee')->update(['value' => '500']);

    $this->getJson('/api/v1/shipping-fee')
        ->assertOk()
        ->assertJsonPath('shipping_fee', '500.00');

    $product = Product::factory()->create([
        'stock_quantity' => 10,
        'price' => 1000,
        'is_published' => true,
    ]);
    $address = Address::factory()->create(['user_id' => $this->customer->id]);

    $this->actingAs($this->customer)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ])->assertCreated();

    $this->actingAs($this->customer)
        ->postJson('/api/v1/orders', ['address_id' => $address->id])
        ->assertCreated()
        ->assertJsonPath('order.subtotal', '2000.00')
        ->assertJsonPath('order.shipping_fee', '500.00')
        ->assertJsonPath('order.total', '2500.00');
});

// ─── Method + rate-limit guards ─────────────────────────────────────────────

test('write methods are rejected with 405', function () {
    $this->postJson('/api/v1/shipping-fee', [])->assertStatus(405);
    $this->putJson('/api/v1/shipping-fee', [])->assertStatus(405);
    $this->deleteJson('/api/v1/shipping-fee')->assertStatus(405);
});

test('the route is guarded by the shipping-fee rate limiter', function () {
    $route = collect(Route::getRoutes())->first(
        fn ($candidate) => $candidate->uri() === 'api/v1/shipping-fee',
    );

    expect($route)->not->toBeNull();
    expect($route->gatherMiddleware())->toContain('throttle:shipping-fee');
});
