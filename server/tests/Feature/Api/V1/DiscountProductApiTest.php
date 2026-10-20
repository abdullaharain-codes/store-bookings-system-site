<?php

use App\Models\Address;
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

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Create exposes compare_at_price + discount_percent ──────────────────────

test('admin can create a discounted product that the public API exposes', function () {
    $create = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/products', [
            'name' => 'Discounted Laptop',
            'sku' => 'DISC-1',
            'price' => 100000,
            'compare_at_price' => 120000,
            'stock_quantity' => 5,
            'is_published' => true,
        ]);

    $create->assertStatus(201)
        ->assertJsonPath('product.price', '100000.00')
        ->assertJsonPath('product.compare_at_price', '120000.00')
        ->assertJsonPath('product.discount_percent', 17);

    $public = $this->getJson('/api/v1/products/'.$create->json('product.slug'));

    $public->assertOk()
        ->assertJsonPath('product.compare_at_price', '120000.00')
        ->assertJsonPath('product.discount_percent', 17)
        ->assertJsonPath('product.price', '100000.00');
});

// ─── compare_at_price must be strictly greater than price ────────────────────

test('compare_at_price at or below the selling price is a 422 on create', function () {
    foreach ([100000, 99999.99] as $compareAt) {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/admin/products', [
                'name' => 'Bad Price',
                'sku' => 'BAD-'.(string) $compareAt,
                'price' => 100000,
                'compare_at_price' => $compareAt,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['compare_at_price']);
    }
});

test('update rejects compare_at_price at or below the effective selling price', function () {
    $product = Product::factory()->create(['price' => 100000, 'compare_at_price' => 120000]);

    // Lowering compare_at_price to (or below) the stored selling price.
    foreach ([100000, 90000] as $compareAt) {
        $this->actingAs($this->admin)
            ->putJson("/api/v1/admin/products/{$product->id}", ['compare_at_price' => $compareAt])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['compare_at_price']);
    }
});

test('raising the price above a stored compare_at_price on update is a 422', function () {
    $product = Product::factory()->create(['price' => 100000, 'compare_at_price' => 120000]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['price' => 125000])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['compare_at_price']);
});

test('update validates against the new price when both price and compare_at_price change', function () {
    $product = Product::factory()->create(['price' => 100000, 'compare_at_price' => 120000]);

    // Both sent: 110000 selling vs 110000 compare-at — the new pair must be
    // validated together, not against the stored compare_at_price.
    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", [
            'price' => 110000,
            'compare_at_price' => 130000,
        ])
        ->assertOk()
        ->assertJsonPath('product.price', '110000.00')
        ->assertJsonPath('product.compare_at_price', '130000.00')
        ->assertJsonPath('product.discount_percent', 15);
});

test('sending null or an empty string clears compare_at_price', function () {
    $product = Product::factory()->create(['price' => 100000, 'compare_at_price' => 120000]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['compare_at_price' => null])
        ->assertOk()
        ->assertJsonPath('product.compare_at_price', null)
        ->assertJsonPath('product.discount_percent', null);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['compare_at_price' => ''])
        ->assertOk()
        ->assertJsonPath('product.compare_at_price', null)
        ->assertJsonPath('product.discount_percent', null);
});

// ─── No discount ─────────────────────────────────────────────────────────────

test('a product without compare_at_price serializes discount_percent null', function () {
    $product = Product::factory()->published()->create(['price' => 5000]);

    $this->getJson("/api/v1/products/{$product->slug}")
        ->assertOk()
        ->assertJsonPath('product.compare_at_price', null)
        ->assertJsonPath('product.discount_percent', null);
});

// ─── Payload exposure across public surfaces (verify, don't assume) ─────────

test('discount fields ride through list, featured, category and brand payloads', function () {
    $brand = Brand::factory()->create();
    $category = Category::factory()->create();

    $product = Product::factory()->published()->forBrand($brand)->create([
        'price' => 100000,
        'compare_at_price' => 120000,
        'stock_quantity' => 5,
        'is_featured' => true,
    ]);
    $product->categories()->sync([$category->id]);

    $list = $this->getJson('/api/v1/products');
    $list->assertOk()
        ->assertJsonPath('data.0.compare_at_price', '120000.00')
        ->assertJsonPath('data.0.discount_percent', 17);

    $this->getJson('/api/v1/products?featured=1')
        ->assertOk()
        ->assertJsonPath('data.0.discount_percent', 17);

    $this->getJson('/api/v1/products?category_id='.$category->id)
        ->assertOk()
        ->assertJsonPath('data.0.discount_percent', 17);

    $this->getJson('/api/v1/products?brand_id='.$brand->id)
        ->assertOk()
        ->assertJsonPath('data.0.discount_percent', 17);
});

test('discount fields ride through wishlist and cart product payloads', function () {
    $product = Product::factory()->published()->create([
        'price' => 100000,
        'compare_at_price' => 120000,
        'stock_quantity' => 5,
    ]);

    $this->actingAs($this->customer)->postJson("/api/v1/wishlist/{$product->id}")->assertOk();

    // WishlistService::list eager-loads product.brand/categories/images, so
    // the real JSON path is wishlist.N.product (WishlistApiTest's "full
    // eager-loaded shape" test) — the discount fields ride it as a model
    // serialization, no wishlist-specific shaping.
    $this->actingAs($this->customer)->getJson('/api/v1/wishlist')
        ->assertOk()
        ->assertJsonPath('wishlist.0.product.compare_at_price', '120000.00')
        ->assertJsonPath('wishlist.0.product.discount_percent', 17);

    $this->actingAs($this->customer)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ])->assertCreated();

    $this->actingAs($this->customer)->getJson('/api/v1/cart')
        ->assertOk()
        ->assertJsonPath('cart.items.0.product.compare_at_price', '120000.00')
        ->assertJsonPath('cart.items.0.product.discount_percent', 17);
});

// ─── Cart and order totals always use the selling price ─────────────────────

test('cart and order totals use price and never compare_at_price', function () {
    $product = Product::factory()->published()->create([
        'price' => 100000,
        'compare_at_price' => 120000,
        'stock_quantity' => 10,
    ]);
    $address = Address::factory()->create(['user_id' => $this->customer->id]);

    $this->actingAs($this->customer)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 2,
    ])->assertCreated();

    $order = $this->actingAs($this->customer)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $order->assertCreated()
        ->assertJsonPath('order.subtotal', '200000.00')
        ->assertJsonPath('order.shipping_fee', '200.00')
        ->assertJsonPath('order.total', '200200.00')
        ->assertJsonPath('order.items.0.unit_price', '100000.00')
        ->assertJsonPath('order.items.0.line_total', '200000.00');

    $this->assertDatabaseHas('order_items', [
        'order_id' => $order->json('order.id'),
        'unit_price' => 100000.00,
        'line_total' => 200000.00,
    ]);
});
