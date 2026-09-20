<?php

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Modules\Catalog\Services\StockHoldService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = new StockHoldService;
});

test('availableStock returns full stock when no holds exist', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    expect($this->service->availableStock($product))->toBe(10);
});

test('availableStock subtracts active holds from other users', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);
    $cart = Cart::factory()->create();

    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 4,
        'hold_expires_at' => now()->addMinutes(10),
    ]);

    expect($this->service->availableStock($product))->toBe(6);
});

test('availableStock excludes a specific cart_item when requested', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);
    $cart = Cart::factory()->create();

    $myItem = CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 4,
        'hold_expires_at' => now()->addMinutes(10),
    ]);

    // Excluding my own hold means available = 10 (not 6).
    expect($this->service->availableStock($product, excludingCartItemId: $myItem->id))->toBe(10);
});

test('availableStock treats expired holds as free stock', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);
    $cart = Cart::factory()->create();

    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 5,
        'hold_expires_at' => now()->subMinutes(5), // expired
    ]);

    // Expired hold should NOT count — all 10 units are available.
    expect($this->service->availableStock($product))->toBe(10);
});

test('availableStock never returns negative', function () {
    $product = Product::factory()->create(['stock_quantity' => 2]);
    $cart = Cart::factory()->create();

    // Over-hold scenario (shouldn't happen in practice, but the method is defensive).
    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 5,
        'hold_expires_at' => now()->addMinutes(10),
    ]);

    expect($this->service->availableStock($product))->toBe(0);
});
