<?php

namespace App\Modules\Catalog\Contracts;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Collection;

interface CartRepositoryInterface
{
    /** Get or create the single cart row for a user. */
    public function findOrCreateForUser(User $user): Cart;

    /** Find an existing cart_item for a specific product in a cart. */
    public function findItem(Cart $cart, Product $product): ?CartItem;

    /**
     * Insert or update a cart_item with a fresh stock hold.
     *
     * If $quantity is 0 the item should be deleted instead — the caller
     * (CartService) is responsible for that check before calling this method.
     */
    public function upsertItem(Cart $cart, Product $product, int $quantity, \DateTimeInterface $holdExpiresAt): CartItem;

    /** Permanently remove a cart_item (ownership already verified by caller). */
    public function removeItem(CartItem $item): void;

    /** All cart_items whose hold has expired (for the housekeeping command). */
    public function findExpiredHolds(): Collection;

    /**
     * Release a hold by nulling hold_expires_at — does NOT delete the row,
     * so the item remains visible in the cart as "no longer reserved".
     */
    public function releaseHold(CartItem $item): void;

    /** Bulk-delete cart_items (called by OrderService after successful checkout). */
    public function deleteCartItems(array $items): void;
}
