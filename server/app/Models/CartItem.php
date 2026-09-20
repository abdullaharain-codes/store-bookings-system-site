<?php

namespace App\Models;

use Database\Factories\CartItemFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CartItem extends Model
{
    /** @use HasFactory<CartItemFactory> */
    use HasFactory;

    protected $fillable = [
        'cart_id',
        'product_id',
        'quantity',
        'hold_expires_at',
    ];

    protected $appends = [
        'hold_status',
    ];

    protected $casts = [
        'hold_expires_at' => 'datetime',
    ];

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Whether this cart item currently holds an active (non-expired) stock
     * reservation. NULL hold_expires_at means no hold was ever set, or the
     * hold was already released/expired and nullified.
     */
    public function isHoldActive(): bool
    {
        return $this->hold_expires_at !== null && $this->hold_expires_at->isFuture();
    }

    /**
     * Computed attribute surfaced for the HTTP layer — the frontend uses
     * this to show "reservation expired, re-add to secure stock" without
     * computing it client-side.
     */
    protected function holdStatus(): Attribute
    {
        return Attribute::get(fn () => match (true) {
            $this->hold_expires_at === null => 'none',
            $this->hold_expires_at->isFuture() => 'active',
            default => 'expired',
        });
    }
}
