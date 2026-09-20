<?php

use App\Models\Address;
use App\Models\BusinessSetting;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Repositories\EloquentCartRepository;
use App\Modules\Catalog\Services\CartService;
use App\Modules\Catalog\Services\StockHoldService;
use App\Modules\Orders\Exceptions\OrderValidationException;
use App\Modules\Orders\Services\OrderService;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->orderService = app(OrderService::class);
    $this->cartService = new CartService(
        new EloquentCartRepository,
        new StockHoldService,
        app(ProductRepositoryInterface::class),
    );
});

// ─── Happy path ────────────────────────────────────────────────────────────

test('placeOrder creates an order with correct subtotal and total', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 1500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 2);

    $order = $this->orderService->placeOrder($this->user, $address->id);
    $order->refresh(); // Sync DB defaults (status, payment_status) into the model.

    expect($order->subtotal)->toBe('3000.00')
        ->and($order->shipping_fee)->toBe('200.00')
        ->and($order->total)->toBe('3200.00')
        ->and($order->status)->toBe('pending')
        ->and($order->payment_status)->toBe('pending')
        ->and($order->order_number)->toStartWith('ORD-');
});

test('placeOrder returns an Order instance with status and payment_status populated (no refresh needed)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);

    $order = $this->orderService->placeOrder($this->user, $address->id);

    // The returned instance must have status and payment_status set
    // directly — callers should not need to call refresh() to see
    // DB-default fields.  This guards against regressions if the
    // create() approach changes later.
    expect($order->status)->not->toBeNull()
        ->and($order->status)->toBe('pending')
        ->and($order->payment_status)->not->toBeNull()
        ->and($order->payment_status)->toBe('pending');
});

test('placeOrder snapshots address fields correctly', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create([
        'user_id' => $this->user->id,
        'recipient_name' => 'Ahmed Raza',
        'phone' => '0321-1234567',
        'address_line_1' => '45 Street 12',
        'city' => 'Lahore',
    ]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    expect($order->recipient_name)->toBe('Ahmed Raza')
        ->and($order->phone)->toBe('0321-1234567')
        ->and($order->address_line_1)->toBe('45 Street 12')
        ->and($order->city)->toBe('Lahore')
        ->and($order->address_id)->toBe($address->id);
});

// ─── Snapshot proof ────────────────────────────────────────────────────────

test('order_items snapshot product data and are unaffected by later product changes', function () {
    $product = Product::factory()->create([
        'name' => 'Widget Pro',
        'sku' => 'WGT-PRO-001',
        'price' => 2000,
        'stock_quantity' => 10,
        'is_published' => true,
    ]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 3);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    // Prove snapshot: rename, reprice the product AFTER ordering.
    $product->update(['name' => 'Widget Ultra', 'sku' => 'WGT-ULTRA-002', 'price' => 5000]);

    $orderItem = $order->items()->first();

    expect($orderItem->product_name)->toBe('Widget Pro')
        ->and($orderItem->product_sku)->toBe('WGT-PRO-001')
        ->and($orderItem->unit_price)->toBe('2000.00')
        ->and($orderItem->quantity)->toBe(3)
        ->and($orderItem->line_total)->toBe('6000.00');

    // Confirm the product itself changed but the order_item did not.
    $product->refresh();
    expect($product->name)->toBe('Widget Ultra')
        ->and($product->price)->toBe('5000.00');
});

// ─── Stock deduction + cart cleanup ────────────────────────────────────────

test('placeOrder deducts stock and removes ordered cart_items', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 100, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 3);

    $this->orderService->placeOrder($this->user, $address->id);

    $product->refresh();
    expect($product->stock_quantity)->toBe(7);

    $cart = Cart::where('user_id', $this->user->id)->first();
    expect($cart->items)->toHaveCount(0);
});

// ─── Empty cart ────────────────────────────────────────────────────────────

test('placeOrder rejects an empty cart', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('empty cart');

    $this->orderService->placeOrder($this->user, $address->id);
});

// ─── Expired hold ──────────────────────────────────────────────────────────

test('placeOrder rejects when a cart_item hold has expired (no partial order created)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);
    $cart = Cart::factory()->create(['user_id' => $this->user->id]);

    // Manually create a cart_item with an expired hold.
    CartItem::factory()->create([
        'cart_id' => $cart->id,
        'product_id' => $product->id,
        'quantity' => 2,
        'hold_expires_at' => now()->subMinutes(5), // expired
    ]);

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('no longer reserved');

    $this->orderService->placeOrder($this->user, $address->id);

    // Verify no order was created (transaction rollback).
    $this->assertDatabaseCount('orders', 0);
    // Verify stock was NOT deducted.
    $product->refresh();
    expect($product->stock_quantity)->toBe(10);
});

// ─── Address IDOR ──────────────────────────────────────────────────────────

test('placeOrder rejects when address belongs to another user (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    $otherAddress = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->cartService->addItem($this->user, $product->id, 1);

    $this->expectException(ResourceNotFoundException::class);

    $this->orderService->placeOrder($this->user, $otherAddress->id);
});

test('placeOrder rejects when address does not exist', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    $this->cartService->addItem($this->user, $product->id, 1);

    $this->expectException(ResourceNotFoundException::class);

    $this->orderService->placeOrder($this->user, 999999);
});

// ─── Concurrency ───────────────────────────────────────────────────────────

test('two different users can independently checkout stock on the same product', function () {
    $product = Product::factory()->create(['stock_quantity' => 5, 'is_published' => true]);
    $addressA = Address::factory()->create(['user_id' => $this->user->id]);
    $addressB = Address::factory()->create(['user_id' => $this->otherUser->id]);

    // User A holds 2 units.
    $this->cartService->addItem($this->user, $product->id, 2);
    // User B holds 2 units (2 remain free — both within available stock).
    $this->cartService->addItem($this->otherUser, $product->id, 2);

    // User A checks out.
    $orderA = $this->orderService->placeOrder($this->user, $addressA->id);

    $product->refresh();
    expect($product->stock_quantity)->toBe(3); // 5 - 2 = 3

    // User B checks out (their hold is still active).
    $orderB = $this->orderService->placeOrder($this->otherUser, $addressB->id);

    $product->refresh();
    expect($product->stock_quantity)->toBe(1); // 3 - 2 = 1

    // Both orders exist and are distinct.
    expect($orderA->id)->not->toBe($orderB->id)
        ->and($orderA->user_id)->toBe($this->user->id)
        ->and($orderB->user_id)->toBe($this->otherUser->id);
});

// ─── order_number uniqueness ───────────────────────────────────────────────

test('order_number is unique across rapid back-to-back creation', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);
    $numbers = collect();

    for ($i = 0; $i < 10; $i++) {
        $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 100, 'is_published' => true]);
        $this->cartService->addItem($this->user, $product->id, 1);

        $order = $this->orderService->placeOrder($this->user, $address->id);
        $numbers->push($order->order_number);
    }

    // All order numbers must be distinct.
    expect($numbers->unique()->count())->toBe(10);
});

// ─── getOrder / listOrders ─────────────────────────────────────────────────

test('getOrder returns the users order with items', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 800, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 2);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    $fetched = $this->orderService->getOrder($this->user, $order->id);

    expect($fetched->id)->toBe($order->id)
        ->and($fetched->relationLoaded('items'))->toBeTrue()
        ->and($fetched->items)->toHaveCount(1);
});

test('getOrder rejects when the order belongs to another user (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 800, 'is_published' => true]);
    $addressA = Address::factory()->create(['user_id' => $this->user->id]);
    $addressB = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $addressA->id);

    $this->expectException(ResourceNotFoundException::class);

    $this->orderService->getOrder($this->otherUser, $order->id);
});

test('listOrders returns only the users orders', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 100, 'is_published' => true]);
    $addressA = Address::factory()->create(['user_id' => $this->user->id]);
    $addressB = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $this->orderService->placeOrder($this->user, $addressA->id);

    $this->cartService->addItem($this->otherUser, $product->id, 1);
    $this->orderService->placeOrder($this->otherUser, $addressB->id);

    $orders = $this->orderService->listOrders($this->user);

    expect($orders->total())->toBe(1)
        ->and($orders->first()->user_id)->toBe($this->user->id);
});

// ─── shipping_fee from BusinessSetting ─────────────────────────────────────

test('placeOrder uses the configured shipping_fee from BusinessSetting', function () {
    // Override shipping_fee to 500.
    DB::table('business_settings')->updateOrInsert(
        ['key' => 'shipping_fee'],
        ['value' => '500', 'type' => 'string', 'updated_at' => now(), 'created_at' => now()],
    );

    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 1000, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    expect($order->shipping_fee)->toBe('500.00')
        ->and($order->total)->toBe('1500.00');
});

// ─── cancelOrder ──────────────────────────────────────────────────────────

test('customer cancels their own pending order: stock restored, status cancelled, audit logged', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 3);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    $product->refresh();
    expect($product->stock_quantity)->toBe(7); // 10 - 3 = 7

    $cancelled = $this->orderService->cancelOrder($this->user, $order);

    $product->refresh();
    expect($product->stock_quantity)->toBe(10); // restored: 7 + 3 = 10
    expect($cancelled->status)->toBe('cancelled');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Order',
        'entity_id' => $cancelled->id,
        'action' => 'cancelled',
        'metadata' => json_encode(['previous_status' => 'pending', 'cancelled_by' => 'customer']),
    ]);
});

test('customer cannot cancel their own confirmed order', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);
    $this->orderService->transitionStatus($order, 'confirmed');

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('Only pending orders can be cancelled');

    $this->orderService->cancelOrder($this->user, $order);
});

test('customer cannot cancel another users order (IDOR)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    $this->expectException(ResourceNotFoundException::class);

    $this->orderService->cancelOrder($this->otherUser, $order);
});

test('admin cancels a confirmed order: stock restored', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 4);
    $order = $this->orderService->placeOrder($this->user, $address->id);
    $this->orderService->transitionStatus($order, 'confirmed');

    $product->refresh();
    expect($product->stock_quantity)->toBe(6); // 10 - 4 = 6

    $cancelled = $this->orderService->cancelOrder($this->user, $order, isAdmin: true);

    $product->refresh();
    expect($product->stock_quantity)->toBe(10); // restored: 6 + 4 = 10
    expect($cancelled->status)->toBe('cancelled');
});

test('admin cannot cancel a delivered order', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);
    $this->orderService->transitionStatus($order, 'confirmed');
    $this->orderService->transitionStatus($order, 'shipped');
    $this->orderService->transitionStatus($order, 'delivered');

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('Cannot cancel a delivered order');

    $this->orderService->cancelOrder($this->user, $order, isAdmin: true);
});

// ─── transitionStatus ─────────────────────────────────────────────────────

test('valid transition path pending->confirmed->shipped->delivered works and payment_status becomes paid', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    expect($order->status)->toBe('pending')
        ->and($order->payment_status)->toBe('pending');

    $order = $this->orderService->transitionStatus($order, 'confirmed');
    expect($order->status)->toBe('confirmed');

    $order = $this->orderService->transitionStatus($order, 'shipped');
    expect($order->status)->toBe('shipped');

    $order = $this->orderService->transitionStatus($order, 'delivered');
    expect($order->status)->toBe('delivered')
        ->and($order->payment_status)->toBe('paid');

    // Verify audit trail
    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Order',
        'entity_id' => $order->id,
        'action' => 'status_changed',
        'metadata' => json_encode(['from' => 'shipped', 'to' => 'delivered']),
    ]);
});

test('invalid transition pending->delivered is rejected with clear message', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('Cannot transition from "pending" to "delivered"');

    $this->orderService->transitionStatus($order, 'delivered');
});

test('no transitions allowed from delivered or cancelled (terminal states)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    // Test delivered is terminal
    $this->cartService->addItem($this->user, $product->id, 1);
    $orderDelivered = $this->orderService->placeOrder($this->user, $address->id);
    $orderDelivered = $this->orderService->transitionStatus($orderDelivered, 'confirmed');
    $orderDelivered = $this->orderService->transitionStatus($orderDelivered, 'shipped');
    $orderDelivered = $this->orderService->transitionStatus($orderDelivered, 'delivered');

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('Cannot transition from "delivered"');

    $this->orderService->transitionStatus($orderDelivered, 'pending');
});

test('no transitions allowed from cancelled (terminal state)', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $product->id, 1);
    $orderCancelled = $this->orderService->placeOrder($this->user, $address->id);
    $this->orderService->cancelOrder($this->user, $orderCancelled);

    $this->expectException(OrderValidationException::class);
    $this->expectExceptionMessage('Cannot transition from "cancelled"');

    $this->orderService->transitionStatus($orderCancelled, 'pending');
});

test('stock restoration is correct with multiple order_items', function () {
    $productA = Product::factory()->create(['stock_quantity' => 10, 'price' => 1000, 'is_published' => true]);
    $productB = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->cartService->addItem($this->user, $productA->id, 3);
    $this->cartService->addItem($this->user, $productB->id, 5);
    $order = $this->orderService->placeOrder($this->user, $address->id);

    $productA->refresh();
    $productB->refresh();
    expect($productA->stock_quantity)->toBe(7)  // 10 - 3 = 7
        ->and($productB->stock_quantity)->toBe(5); // 10 - 5 = 5

    $this->orderService->cancelOrder($this->user, $order);

    $productA->refresh();
    $productB->refresh();
    expect($productA->stock_quantity)->toBe(10) // restored: 7 + 3 = 10
        ->and($productB->stock_quantity)->toBe(10); // restored: 5 + 5 = 10
});

test('cancelling an order does not affect other orders stock', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 500, 'is_published' => true]);
    $addressA = Address::factory()->create(['user_id' => $this->user->id]);
    $addressB = Address::factory()->create(['user_id' => $this->otherUser->id]);

    // User A orders 3 units
    $this->cartService->addItem($this->user, $product->id, 3);
    $orderA = $this->orderService->placeOrder($this->user, $addressA->id);

    // User B orders 2 units
    $this->cartService->addItem($this->otherUser, $product->id, 2);
    $orderB = $this->orderService->placeOrder($this->otherUser, $addressB->id);

    $product->refresh();
    expect($product->stock_quantity)->toBe(5); // 10 - 3 - 2 = 5

    // Cancel User A's order
    $this->orderService->cancelOrder($this->user, $orderA);

    $product->refresh();
    expect($product->stock_quantity)->toBe(8); // 5 + 3 = 8 (only A's quantity restored)

    // User B's order is unaffected
    $orderB->refresh();
    expect($orderB->status)->toBe('pending'); // still pending, not cancelled
});
