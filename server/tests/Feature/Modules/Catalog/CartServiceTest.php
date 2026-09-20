<?php

use App\Models\BusinessSetting;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Exceptions\CartValidationException;
use App\Modules\Catalog\Repositories\EloquentCartRepository;
use App\Modules\Catalog\Services\CartService;
use App\Modules\Catalog\Services\StockHoldService;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->service = new CartService(
        new EloquentCartRepository,
        new StockHoldService,
        app(ProductRepositoryInterface::class),
    );
});

// ─── addItem ────────────────────────────────────────────────────────────────

test('addItem creates a cart item with correct stock hold expiry', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $item = $this->service->addItem($this->user, $product->id, 2);

    expect($item->quantity)->toBe(2)
        ->and($item->hold_expires_at)->not->toBeNull();

    // Expiry ≈ now + cart_hold_minutes (seeded as 15 in migration).
    // Use diffInSeconds to avoid truncation from diffInMinutes.
    $expectedMinutes = (int) BusinessSetting::getValue('cart_hold_minutes', 15);
    $diffSeconds = now()->diffInSeconds($item->hold_expires_at);
    expect($diffSeconds)->toBeGreaterThanOrEqual($expectedMinutes * 60 - 5)
        ->toBeLessThanOrEqual($expectedMinutes * 60 + 5);
});

test('addItem on an existing cart_item increases quantity and extends hold', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $first = $this->service->addItem($this->user, $product->id, 2);
    $second = $this->service->addItem($this->user, $product->id, 3);

    expect($second->id)->toBe($first->id) // same row, updated
        ->and($second->quantity)->toBe(5)
        ->and($second->hold_expires_at->gte($first->hold_expires_at))->toBeTrue();
});

test('addItem rejects when requested quantity exceeds available stock', function () {
    $product = Product::factory()->create(['stock_quantity' => 3, 'is_published' => true]);

    $this->service->addItem($this->user, $product->id, 2); // 2 held, 1 left

    $this->expectException(CartValidationException::class);
    $this->expectExceptionMessage('Only 1 left in stock');

    $this->service->addItem($this->user, $product->id, 2); // needs 2, only 1 available
});

test('addItem rejects an unpublished product', function () {
    $product = Product::factory()->create(['is_published' => false]);

    $this->expectException(CartValidationException::class);
    $this->expectExceptionMessage('not currently available');

    $this->service->addItem($this->user, $product->id, 1);
});

test('addItem rejects a non-existent product', function () {
    $this->expectException(CartValidationException::class);
    $this->expectExceptionMessage('does not exist');

    $this->service->addItem($this->user, 999999, 1);
});

// ─── Concurrency simulation ─────────────────────────────────────────────────

test('addItem rejects when another user holds the last units (locking proves correctness)', function () {
    // stock=1, user A holds it — user B must be rejected.
    $product = Product::factory()->create(['stock_quantity' => 1, 'is_published' => true]);

    $this->service->addItem($this->user, $product->id, 1);

    $this->expectException(CartValidationException::class);
    $this->expectExceptionMessage('Only 0 left in stock');

    $this->service->addItem($this->otherUser, $product->id, 1);
});

test('addItem succeeds when another user holds stock but enough remains', function () {
    $product = Product::factory()->create(['stock_quantity' => 5, 'is_published' => true]);

    $this->service->addItem($this->user, $product->id, 3); // 3 held, 2 left

    $item = $this->service->addItem($this->otherUser, $product->id, 2); // exactly 2 left

    expect($item->quantity)->toBe(2);
});

// ─── Expired hold does not block ────────────────────────────────────────────

test('addItem succeeds when existing hold on the same stock has expired', function () {
    $product = Product::factory()->create(['stock_quantity' => 1, 'is_published' => true]);
    $cart = Cart::factory()->create(['user_id' => $this->user->id]);

    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 1,
        'hold_expires_at' => now()->subMinutes(5), // expired
    ]);

    // The expired hold must not count — the other user should be able to add.
    $item = $this->service->addItem($this->otherUser, $product->id, 1);

    expect($item->quantity)->toBe(1);
});

// ─── updateQuantity ─────────────────────────────────────────────────────────

test('updateQuantity extends the hold expiry', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $item = $this->service->addItem($this->user, $product->id, 2);

    $updated = $this->service->updateQuantity($this->user, $item, 5);

    expect($updated->quantity)->toBe(5)
        ->and($updated->hold_expires_at->gte($item->hold_expires_at))->toBeTrue();
});

test('updateQuantity to 0 delegates to removeItem', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $item = $this->service->addItem($this->user, $product->id, 2);

    $this->service->updateQuantity($this->user, $item, 0);

    $this->assertDatabaseMissing('cart_items', ['id' => $item->id]);
});

test('updateQuantity rejects when new quantity exceeds available', function () {
    $product = Product::factory()->create(['stock_quantity' => 3, 'is_published' => true]);
    $item = $this->service->addItem($this->user, $product->id, 1); // 1 held, 2 free

    $this->expectException(CartValidationException::class);

    $this->service->updateQuantity($this->user, $item, 5); // wants 5, only 2+1=3 total
});

// ─── removeItem ─────────────────────────────────────────────────────────────

test('removeItem deletes the row permanently', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $item = $this->service->addItem($this->user, $product->id, 2);

    $this->service->removeItem($this->user, $item);

    $this->assertDatabaseMissing('cart_items', ['id' => $item->id]);
});

test('removeItem rejects when the item belongs to another user (IDOR protection)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $item = $this->service->addItem($this->user, $product->id, 2);

    $this->expectException(ResourceNotFoundException::class);

    $this->service->removeItem($this->otherUser, $item);
});

// ─── getCart ────────────────────────────────────────────────────────────────

test('getCart eager-loads items.product and returns the users cart', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $this->service->addItem($this->user, $product->id, 2);

    $cart = $this->service->getCart($this->user);

    expect($cart->items)->toHaveCount(1)
        ->and($cart->items->first()->relationLoaded('product'))->toBeTrue()
        ->and($cart->items->first()->product->id)->toBe($product->id);
});

// ─── ReleaseExpiredStockHolds command ───────────────────────────────────────

test('releaseExpiredHolds command nulls expired holds and leaves active ones untouched', function () {
    $productExpired = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $productActive = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $cart = Cart::factory()->create(['user_id' => $this->user->id]);

    $expired = CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $productExpired->id,
        'quantity' => 3,
        'hold_expires_at' => now()->subMinutes(5),
    ]);

    $active = CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $productActive->id,
        'quantity' => 2,
        'hold_expires_at' => now()->addMinutes(10),
    ]);

    $this->artisan('stock:release-expired-holds')
        ->assertExitCode(0)
        ->expectsOutputToContain('Released 1 expired hold(s).');

    // Expired item: hold nullified but row persists.
    $expired->refresh();
    expect($expired->hold_expires_at)->toBeNull()
        ->and($expired->exists)->toBeTrue();

    // Active item: untouched.
    $active->refresh();
    expect($active->hold_expires_at->isFuture())->toBeTrue();
});
