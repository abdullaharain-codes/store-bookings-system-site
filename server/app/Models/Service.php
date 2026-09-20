<?php

namespace App\Models;

use Database\Factories\ServiceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A bookable IT service (e.g. "Laptop Screen Repair").
 *
 * Business rule (PRD §10 service pricing, phases.md Phase 6):
 * price_min must be <= price_max. This is a model-level *convention* note
 * only — the invariant is NOT enforced here. Actual enforcement lives in
 * the Services module service layer (the next build step), following the
 * same pattern used to enforce Category/Brand invariants in Taxonomy.
 */
class Service extends Model
{
    /** @use HasFactory<ServiceFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'price_min',
        'price_max',
        'duration_minutes',
        'is_published',
    ];

    protected $casts = [
        'is_published' => 'boolean',
        'price_min' => 'decimal:2',
        'price_max' => 'decimal:2',
    ];

    /**
     * Service reviews — the public read path is published-only (ReviewService).
     */
    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }
}
