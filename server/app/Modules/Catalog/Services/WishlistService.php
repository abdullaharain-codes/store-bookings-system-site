<?php

namespace App\Modules\Catalog\Services;

use App\Models\Product;
use App\Models\User;
use App\Models\Wishlist;
use Illuminate\Support\Collection;

class WishlistService
{
    /**
     * Toggle a product in the user's wishlist.
     *
     * @return bool true if the product is now wishlisted, false if removed.
     */
    public function toggle(User $user, Product $product): bool
    {
        $existing = Wishlist::where('user_id', $user->id)
            ->where('product_id', $product->id)
            ->first();

        if ($existing) {
            $existing->delete();

            return false;
        }

        Wishlist::create([
            'user_id' => $user->id,
            'product_id' => $product->id,
        ]);

        return true;
    }

    /**
     * The user's full wishlist, eager-loading products (rules.md §10).
     */
    public function list(User $user): Collection
    {
        return Wishlist::where('user_id', $user->id)
            ->with('product')
            ->get();
    }

    /**
     * Count the user's wishlisted products — the dashboard's lightweight
     * count-only path. Never fetches the full wishlist with eager-loaded
     * products just to call ->count() (rules.md §10 / dashboard N+1 rule).
     */
    public function count(User $user): int
    {
        return Wishlist::where('user_id', $user->id)->count();
    }
}
