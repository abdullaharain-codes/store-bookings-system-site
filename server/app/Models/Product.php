<?php

namespace App\Models;

use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'sku',
        'description',
        'price',
        // Nullable "was price" for the strikethrough + discount badge (DISCOUNT-1).
        // Null means "no discount"; price stays the ONLY selling price.
        'compare_at_price',
        'stock_quantity',
        'brand_id',
        'is_published',
        // Admin-set merchandising flag (BE2). NOT NULL in the schema, so the
        // only two states are true/false — never null.
        'is_featured',
    ];

    protected $casts = [
        'is_published' => 'boolean',
        // Cast so the JSON payload always carries a real boolean rather than
        // leaking the raw 0/1 SQLite/MySQL integer representation.
        'is_featured' => 'boolean',
        'price' => 'decimal:2',
        'compare_at_price' => 'decimal:2',
    ];

    // Appended so the computed discount (DISCOUNT-1) rides through every
    // serialization — public and admin — without per-endpoint hand-built
    // arrays. compare_at_price itself is a real column, so it serializes on
    // its own.
    protected $appends = ['discount_percent'];

    // Nullable FK: a product is valid without a brand.
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('display_order');
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'product_category');
    }

    /**
     * Product reviews — the public read path is published-only (ReviewService).
     */
    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    /**
     * Lazily-computed discount for the storefront badge, in whole percent
     * (rounded). Null — not "0" — when there is no discount, so UI code can
     * branch on presence instead of probing for a meaningful value.
     */
    public function getDiscountPercentAttribute(): ?int
    {
        if ($this->compare_at_price === null) {
            return null;
        }

        $price = (float) $this->price;
        $compareAt = (float) $this->compare_at_price;

        if ($compareAt <= $price) {
            return null;
        }

        return (int) round(($compareAt - $price) / $compareAt * 100);
    }
}
