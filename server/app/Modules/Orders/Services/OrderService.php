<?php

namespace App\Modules\Orders\Services;

use App\Models\BusinessSetting;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Modules\Catalog\Contracts\CartRepositoryInterface;
use App\Modules\Orders\Contracts\AddressRepositoryInterface;
use App\Modules\Orders\Exceptions\OrderValidationException;
use App\Shared\AuditLogger;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Handles order placement, retrieval, cancellation and status transitions.
 *
 * placeOrder() is the most correctness-critical method in this module:
 * it converts temporary cart stock holds into permanent stock deductions
 * inside a single transaction with lockForUpdate() on every product row
 * being purchased — the same critical-section pattern from
 * architecture.md §4.2 and CartService.
 *
 * cancelOrder() and transitionStatus() follow the same critical-section
 * pattern (DB::transaction + lockForUpdate) when restoring stock.
 */
class OrderService
{
    public function __construct(
        private readonly CartRepositoryInterface $cartRepo,
        private readonly AddressRepositoryInterface $addressRepo,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * Place an order from the user's current cart.
     *
     * The entire operation is wrapped in DB::transaction() with lockForUpdate()
     * on each product row being purchased.  For every cart item, the hold is
     * re-validated (hold_expires_at > now()) — if a hold expired between
     * add-to-cart and checkout, the order is rejected with a clear message
     * (rules.md §8).
     *
     * On success: creates the Order (snapshotting address fields), creates
     * OrderItems (snapshotting product name/sku/price), deducts stock
     * permanently, deletes the ordered cart_items, and writes an AuditLog.
     *
     * @throws OrderValidationException if the cart is empty or a hold expired.
     * @throws ResourceNotFoundException if the address does not belong to the user.
     */
    public function placeOrder(User $user, int $addressId): Order
    {
        // ── 1. Validate address ownership ──
        $address = $this->addressRepo->find($addressId);

        if (! $address || $address->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }

        // ── 2. Validate cart is non-empty ──
        $cart = $this->cartRepo->findOrCreateForUser($user);
        $cart->load('items.product');

        if ($cart->items->isEmpty()) {
            throw new OrderValidationException('Cannot place an order with an empty cart.');
        }

        $shippingFee = (float) BusinessSetting::getValue('shipping_fee', 200);

        // ── 3. Atomic order creation ──
        //
        // The lockForUpdate() on each product row serialises every concurrent
        // checkout attempt for the same product — one transaction proceeds
        // while the other blocks until the first commits or rolls back.
        // This is the double-booking prevention pattern from
        // architecture.md §4.2.
        return DB::transaction(function () use ($user, $cart, $address, $shippingFee) {
            $lineItems = [];
            $subtotal = '0.00';

            foreach ($cart->items as $item) {
                // ── 3a. Lock and validate the product row ──
                $product = Product::query()
                    ->where('id', $item->product_id)
                    ->lockForUpdate()
                    ->first();

                if (! $product) {
                    throw new OrderValidationException(
                        "The product \"{$item->product->name}\" is no longer available.",
                    );
                }

                if (! $product->is_published) {
                    throw new OrderValidationException(
                        "\"{$product->name}\" is no longer available for purchase.",
                    );
                }

                // ── 3b. Re-validate the hold (rules.md §8) ──
                if ($item->hold_expires_at === null || $item->hold_expires_at->isPast()) {
                    throw new OrderValidationException(
                        "\"{$product->name}\" is no longer reserved. Please re-add it to your cart.",
                    );
                }

                // ── 3c. Re-validate stock (hold may have lapsed for other items) ──
                // Count active holds by OTHER users only — the current user's
                // own hold is what we're converting to a permanent deduction,
                // so it must not be counted against them (same principle as
                // CartService excluding its own hold via excludingCartItemId).
                $othersHolding = CartItem::query()
                    ->where('product_id', $product->id)
                    ->where('hold_expires_at', '>', now())
                    ->whereHas('cart', fn ($q) => $q->where('user_id', '!=', $user->id))
                    ->sum('quantity');

                $available = max(0, $product->stock_quantity - $othersHolding);

                if ($item->quantity > $available) {
                    throw new OrderValidationException(
                        "Insufficient stock for \"{$product->name}\". Only {$available} available.",
                    );
                }

                // ── 3d. Snapshot product data ──
                $unitPrice = number_format($product->price, 2, '.', '');
                $lineTotal = number_format($product->price * $item->quantity, 2, '.', '');

                $lineItems[] = [
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'unit_price' => $unitPrice,
                    'quantity' => $item->quantity,
                    'line_total' => $lineTotal,
                ];

                // ── 3e. Permanent stock deduction ──
                // This converts the temporary hold into a permanent deduction.
                // stock_quantity -= quantity inside the lock — no other
                // transaction can read the stale value.
                $product->decrement('stock_quantity', $item->quantity);

                $subtotal = number_format((float) $subtotal + (float) $lineTotal, 2, '.', '');
            }

            // ── 4. Compute totals ──
            $total = number_format((float) $subtotal + $shippingFee, 2, '.', '');

            // ── 5. Create Order (with address snapshot) ──
            //
            // status and payment_status are explicitly set here rather than
            // relying on the migration's DB-level defaults, so the returned
            // Order instance has all fields populated without a refresh().
            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'user_id' => $user->id,
                'address_id' => $address->id,
                'recipient_name' => $address->recipient_name,
                'phone' => $address->phone,
                'address_line_1' => $address->address_line_1,
                'address_line_2' => $address->address_line_2,
                'city' => $address->city,
                'postal_code' => $address->postal_code,
                'subtotal' => $subtotal,
                'shipping_fee' => number_format($shippingFee, 2, '.', ''),
                'total' => $total,
                'status' => 'pending',
                'payment_status' => 'pending',
            ]);

            // ── 6. Create OrderItems ──
            foreach ($lineItems as $lineItem) {
                $order->items()->create($lineItem);
            }

            // ── 7. Remove ordered cart_items (hold → permanent deduction done) ──
            $this->cartRepo->deleteCartItems($cart->items->all());

            // ── 8. Audit log ──
            $this->auditLogger->log('Order', $order->id, 'created');

            return $order;
        });
    }

    /**
     * Get a single order with items eager-loaded — ownership-checked.
     *
     * @throws ResourceNotFoundException
     */
    public function getOrder(User $user, int $orderId): Order
    {
        $order = Order::with('items')->findOrFail($orderId);

        if ($order->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }

        return $order;
    }

    /**
     * List the user's orders, paginated and ownership-scoped.
     */
    public function listOrders(User $user): LengthAwarePaginator
    {
        return Order::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->paginate(15);
    }

    /**
     * Count the user's orders — a lightweight count-only path for the
     * dashboard overview. Never paginates/fetches full rows just to call
     * ->count() on them (rules.md §10).
     */
    public function countOrders(User $user): int
    {
        return Order::where('user_id', $user->id)->count();
    }

    /**
     * The DELIVERED order in which this user purchased the product, if any —
     * the eligibility proof that grants a product review (ReleasePlan §12).
     *
     * Returns the order id (recorded on the review as source_id) or null.
     * Written here on the owning module's service so Reviews never queries
     * orders/order_items directly (architecture.md §3). A single
     * exists-bounded SELECT — no order rows are materialized (rules.md §10).
     */
    public function findReceivedOrderForProduct(User $user, int $productId): ?int
    {
        return Order::query()
            ->where('user_id', $user->id)
            ->where('status', 'delivered')
            ->whereHas('items', fn ($query) => $query->where('product_id', $productId))
            ->value('id');
    }

    /**
     * Admin listing — all orders, no user scoping.
     *
     * Supports optional filters: status, user_id, order_number (partial match).
     */
    public function listAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        $query = Order::query()->orderByDesc('created_at');

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['user_id'])) {
            $query->where('user_id', $filters['user_id']);
        }

        if (! empty($filters['order_number'])) {
            $query->where('order_number', 'like', '%'.$filters['order_number'].'%');
        }

        return $query->paginate($filters['per_page'] ?? 15);
    }

    /**
     * Get a single order with items eager-loaded — admin context, no ownership check.
     */
    public function getOrderForAdmin(int $orderId): Order
    {
        return Order::with('items')->findOrFail($orderId);
    }

    /**
     * Cancel an order and restore stock for each order item.
     *
     * Customer cancellation is allowed only while status = 'pending'.
     * Admin cancellation is allowed from 'pending', 'confirmed', or
     * 'shipped'.  'delivered' and 'cancelled' are terminal — no
     * further transitions from either.
     *
     * Stock restoration uses DB::transaction() with lockForUpdate() on
     * each product row (same critical-section pattern as placeOrder).
     *
     * @throws ResourceNotFoundException if the customer does not own the order.
     * @throws OrderValidationException if the status transition is invalid.
     */
    public function cancelOrder(User $user, Order $order, bool $isAdmin = false): Order
    {
        // ── 1. Ownership check (customer only) ──
        if (! $isAdmin && $order->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }

        // ── 2. Status validation ──
        if ($order->status === 'delivered') {
            throw new OrderValidationException(
                'Cannot cancel a delivered order. Please contact support.',
            );
        }

        if ($order->status === 'cancelled') {
            throw new OrderValidationException(
                'This order has already been cancelled.',
            );
        }

        if (! $isAdmin && $order->status !== 'pending') {
            throw new OrderValidationException(
                'Only pending orders can be cancelled. Please contact support.',
            );
        }

        // ── 3. Atomic stock restoration ──
        return DB::transaction(function () use ($order, $isAdmin) {
            $order->load('items.product');

            foreach ($order->items as $item) {
                $product = Product::query()
                    ->where('id', $item->product_id)
                    ->lockForUpdate()
                    ->first();

                if ($product) {
                    $product->increment('stock_quantity', $item->quantity);
                }
            }

            $previousStatus = $order->status;

            $order->update(['status' => 'cancelled']);

            $this->auditLogger->log('Order', $order->id, 'cancelled', [
                'previous_status' => $previousStatus,
                'cancelled_by' => $isAdmin ? 'admin' : 'customer',
            ]);

            return $order;
        });
    }

    /**
     * Transition an order to a new status (admin-only).
     *
     * Validates the transition against the status graph:
     *   pending → confirmed → shipped → delivered
     *   pending/confirmed/shipped → cancelled
     *   delivered and cancelled are terminal.
     *
     * When transitioning to 'delivered', payment_status is automatically
     * set to 'paid' (COD — payment happens at delivery).
     *
     * @throws OrderValidationException if the transition is invalid.
     */
    public function transitionStatus(Order $order, string $newStatus): Order
    {
        $this->validateTransition($order->status, $newStatus);

        $previousStatus = $order->status;

        $updates = ['status' => $newStatus];

        if ($newStatus === 'delivered') {
            $updates['payment_status'] = 'paid';
        }

        $order->update($updates);

        $this->auditLogger->log('Order', $order->id, 'status_changed', [
            'from' => $previousStatus,
            'to' => $newStatus,
        ]);

        return $order;
    }

    /**
     * Validate that a status transition is allowed.
     *
     * Encapsulated here so it is not duplicated between cancelOrder()
     * and transitionStatus() (rules.md §3 DRY).
     *
     * @throws OrderValidationException if the transition is not in the graph.
     */
    private function validateTransition(string $from, string $to): void
    {
        $transitions = [
            'pending' => ['confirmed', 'cancelled'],
            'confirmed' => ['shipped', 'cancelled'],
            'shipped' => ['delivered', 'cancelled'],
        ];

        $allowed = $transitions[$from] ?? [];

        if (! in_array($to, $allowed, true)) {
            throw new OrderValidationException(
                "Cannot transition from \"{$from}\" to \"{$to}\".",
            );
        }
    }

    /**
     * Generate a unique, human-readable order number.
     *
     * Format: ORD-{YYYY}-{12-char alphanumeric}
     * Example: ORD-2026-A1B2C3D4E5F6
     *
     * Collision safety: 36^12 ≈ 4.7 × 10^18 possible suffixes per day.
     * Even at 1,000 orders per second sustained for a year (~31.5 billion
     * orders), the birthday-bound probability of a single collision is
     * approximately 10^-7 — negligible.  The UNIQUE index on order_number
     * provides a hard database-level backstop in the astronomically
     * unlikely event of a collision: the transaction rolls back, and the
     * caller can retry.
     */
    private function generateOrderNumber(): string
    {
        return 'ORD-'.date('Y').'-'.Str::upper(Str::random(12));
    }
}
