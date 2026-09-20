<?php

use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Modules\Catalog\Services\WishlistService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->service = new WishlistService;
});

test('toggle adds a product to the wishlist and returns true', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);

    $result = $this->service->toggle($this->user, $product);

    expect($result)->toBeTrue();
    $this->assertDatabaseHas('wishlists', [
        'user_id' => $this->user->id,
        'product_id' => $product->id,
    ]);
});

test('toggle removes a previously wishlisted product and returns false', function () {
    $product = Product::factory()->create(['stock_quantity' => 10]);
    $this->service->toggle($this->user, $product); // add

    $result = $this->service->toggle($this->user, $product); // remove

    expect($result)->toBeFalse();
    $this->assertDatabaseMissing('wishlists', [
        'user_id' => $this->user->id,
        'product_id' => $product->id,
    ]);
});

test('toggle does not affect other users wishlists', function () {
    $otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $product = Product::factory()->create(['stock_quantity' => 10]);

    $this->service->toggle($this->user, $product);     // user adds
    $this->service->toggle($otherUser, $product);       // other user adds

    $this->service->toggle($this->user, $product);     // user removes

    // other user's wish should still be there
    $this->assertDatabaseHas('wishlists', [
        'user_id' => $otherUser->id,
        'product_id' => $product->id,
    ]);
});

test('list returns the users wishlisted products with product eager-loaded', function () {
    $productA = Product::factory()->create(['stock_quantity' => 5]);
    $productB = Product::factory()->create(['stock_quantity' => 3]);

    $this->service->toggle($this->user, $productA);
    $this->service->toggle($this->user, $productB);

    $list = $this->service->list($this->user);

    expect($list)->toHaveCount(2)
        ->and($list->first()->relationLoaded('product'))->toBeTrue();
});

test('list returns empty collection when user has no wishlisted products', function () {
    $list = $this->service->list($this->user);

    expect($list)->toHaveCount(0);
});
