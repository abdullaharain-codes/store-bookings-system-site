<?php

namespace App\Modules\Catalog\Repositories;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\User;
use App\Modules\Catalog\Contracts\CartRepositoryInterface;
use Illuminate\Support\Collection;

class EloquentCartRepository implements CartRepositoryInterface
{
    public function findOrCreateForUser(User $user): Cart
    {
        return Cart::firstOrCreate(['user_id' => $user->id]);
    }

    public function findItem(Cart $cart, Product $product): ?CartItem
    {
        return CartItem::where('cart_id', $cart->id)
            ->where('product_id', $product->id)
            ->first();
    }

    public function upsertItem(Cart $cart, Product $product, int $quantity, \DateTimeInterface $holdExpiresAt): CartItem
    {
        $item = $this->findItem($cart, $product);

        if ($item) {
            $item->update([
                'quantity' => $quantity,
                'hold_expires_at' => $holdExpiresAt,
            ]);

            return $item->refresh();
        }

        return CartItem::create([
            'cart_id' => $cart->id,
            'product_id' => $product->id,
            'quantity' => $quantity,
            'hold_expires_at' => $holdExpiresAt,
        ]);
    }

    public function removeItem(CartItem $item): void
    {
        $item->delete();
    }

    public function findExpiredHolds(): Collection
    {
        return CartItem::query()
            ->whereNotNull('hold_expires_at')
            ->where('hold_expires_at', '<', now())
            ->get();
    }

    public function releaseHold(CartItem $item): void
    {
        $item->update(['hold_expires_at' => null]);
    }

    public function deleteCartItems(array $items): void
    {
        foreach ($items as $item) {
            $item->delete();
        }
    }
}
