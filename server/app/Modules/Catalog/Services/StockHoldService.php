<?php

namespace App\Modules\Catalog\Services;

use App\Models\CartItem;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;

/**
 * Read-only stock-availability checker that accounts for temporary cart
 * holds. Side-effect-free by design — never mutates rows.
 *
 * Correctness rule: available stock is ALWAYS computed live by filtering
 * out expired holds at query time. A cleanup job (ReleaseExpiredStockHolds)
 * exists only for housekeeping, never as a correctness mechanism.
 */
class StockHoldService
{
    /**
     * How many units of a product are available for new holds.
     *
     * Computed as: product.stock_quantity minus the SUM of quantity from
     * all active (non-expired) cart_item holds on that product, excluding
     * one specific hold (the caller's own, when checking whether they can
     * increase an existing hold).
     *
     * @param  int|null  $excludingCartItemId  a cart_item ID to exclude from
     *                                         the hold sum — used when CartService checks whether an
     *                                         existing hold can be INCREASED without counting itself.
     */
    public function availableStock(Product $product, ?int $excludingCartItemId = null): int
    {
        $activeHoldQuantity = CartItem::query()
            ->where('product_id', $product->id)
            ->where('hold_expires_at', '>', now())
            ->when(
                $excludingCartItemId,
                fn (Builder $query, int $id) => $query->where('id', '!=', $id),
            )
            ->sum('quantity');

        return max(0, $product->stock_quantity - $activeHoldQuantity);
    }
}
