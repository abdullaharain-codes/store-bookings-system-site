<?php

namespace App\Modules\Catalog\Services;

use App\Models\BusinessSetting;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\User;
use App\Modules\Catalog\Contracts\CartRepositoryInterface;
use App\Modules\Catalog\Contracts\ProductRepositoryInterface;
use App\Modules\Catalog\Exceptions\CartValidationException;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * Manages the authenticated user's shopping cart with temporary stock holds.
 *
 * Every mutation that touches quantity goes through a DB::transaction() with
 * lockForUpdate() on the product row — the same critical-section pattern
 * architecture.md §4.2 prescribes for double-booking prevention. This makes
 * overselling structurally impossible, not merely unlikely.
 */
class CartService
{
    public function __construct(
        private readonly CartRepositoryInterface $cartRepo,
        private readonly StockHoldService $stockHold,
        private readonly ProductRepositoryInterface $productRepo,
    ) {}

    /**
     * Add a product to the user's cart (or increase its quantity if already
     * present). Creates/extends a temporary stock hold each time.
     *
     * @throws CartValidationException
     */
    public function addItem(User $user, int $productId, int $quantity): CartItem
    {
        if ($quantity < 1) {
            throw new CartValidationException('Quantity must be at least 1.');
        }

        $holdMinutes = (int) BusinessSetting::getValue('cart_hold_minutes', 15);

        // The entire add-to-cart flow is a single atomic transaction. The
        // lockForUpdate() on the product row serialises every concurrent
        // addItem for the same product — one transaction proceeds while the
        // other blocks until the first commits or rolls back. This is the
        // double-booking prevention pattern from architecture.md §4.2.
        return DB::transaction(function () use ($user, $productId, $quantity, $holdMinutes) {
            $product = Product::query()->where('id', $productId)->lockForUpdate()->first();

            if (! $product) {
                throw new CartValidationException('The requested product does not exist.');
            }

            if (! $product->is_published) {
                throw new CartValidationException('This product is not currently available for purchase.');
            }

            $cart = $this->cartRepo->findOrCreateForUser($user);
            $existingItem = $this->cartRepo->findItem($cart, $product);

            if ($existingItem) {
                $newQuantity = $existingItem->quantity + $quantity;

                // Exclude THIS item's own hold so the stock check reflects
                // what OTHER users are holding — otherwise we'd count our
                // own reservation against ourselves.
                $available = $this->stockHold->availableStock($product, excludingCartItemId: $existingItem->id);

                if ($newQuantity > $available) {
                    $additionalAvailable = max(0, $available - $existingItem->quantity);

                    throw new CartValidationException(
                        "Only {$additionalAvailable} left in stock. Cannot increase to {$newQuantity}.",
                    );
                }

                return $this->cartRepo->upsertItem(
                    $cart,
                    $product,
                    $newQuantity,
                    now()->addMinutes($holdMinutes),
                );
            }

            // New item — no existing hold to exclude.
            $available = $this->stockHold->availableStock($product);

            if ($quantity > $available) {
                throw new CartValidationException(
                    "Only {$available} left in stock.",
                );
            }

            return $this->cartRepo->upsertItem(
                $cart,
                $product,
                $quantity,
                now()->addMinutes($holdMinutes),
            );
        });
    }

    /**
     * Replace a cart_item's quantity. If $newQuantity is 0, remove the item
     * entirely. Same locking/stock-check pattern as addItem.
     *
     * @throws CartValidationException
     */
    public function updateQuantity(User $user, CartItem $item, int $newQuantity): CartItem
    {
        if ($newQuantity < 0) {
            throw new CartValidationException('Quantity cannot be negative.');
        }

        if ($newQuantity === 0) {
            $this->removeItem($user, $item);

            // Return a stub — the row is gone, but the caller should not
            // crash. The HTTP layer will return 200 with the updated cart.
            return $item;
        }

        $holdMinutes = (int) BusinessSetting::getValue('cart_hold_minutes', 15);

        return DB::transaction(function () use ($user, $item, $newQuantity, $holdMinutes) {
            $this->assertOwnership($user, $item);

            $product = Product::query()->where('id', $item->product_id)->lockForUpdate()->first();

            $available = $this->stockHold->availableStock($product, excludingCartItemId: $item->id);

            if ($newQuantity > $available) {
                throw new CartValidationException(
                    "Only {$available} left in stock. Cannot set quantity to {$newQuantity}.",
                );
            }

            return $this->cartRepo->upsertItem(
                $item->cart,
                $product,
                $newQuantity,
                now()->addMinutes($holdMinutes),
            );
        });
    }

    /**
     * Permanently remove a cart_item (not the same as expiring a hold —
     * the row disappears entirely).
     *
     * @throws CartValidationException (ownership failure)
     */
    public function removeItem(User $user, CartItem $item): void
    {
        $this->assertOwnership($user, $item);
        $this->cartRepo->removeItem($item);
    }

    /**
     * Get the user's cart with items + products eager-loaded (rules.md §10).
     */
    public function getCart(User $user): Cart
    {
        $cart = $this->cartRepo->findOrCreateForUser($user);
        $cart->load('items.product');

        return $cart;
    }

    /**
     * Ownership guard — prevents IDOR by ensuring the cart_item belongs to
     * the authenticated user's cart (architecture.md §5, §10).
     *
     * Throws ResourceNotFoundException (→ 404), NOT CartValidationException
     * (→ 422): the client must not be able to distinguish "item doesn't
     * exist" from "item belongs to someone else."
     *
     * @throws ResourceNotFoundException
     */
    private function assertOwnership(User $user, CartItem $item): void
    {
        if ($item->cart->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }
    }
}
