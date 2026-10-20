<?php

namespace App\Models;

use Database\Factories\HomepageBannerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Homepage Hero Banner (PRD §8).
 *
 * Linked to its destination via a REAL FK to Category (target_category_id) —
 * never a hard-coded URL (architecture.md §4/§6). The public payload resolves
 * the live category slug at click time, so an admin re-pointing a banner takes
 * effect immediately.
 *
 * Also carries optional overlay text (headline/subtitle, BE1) for design.md
 * §3.7's "optional overlay text". Both are plain nullable strings — no casts
 * are needed, and deliberately none are added so the JSON shape stays a string
 * or null rather than gaining a surprise type.
 */
class HomepageBanner extends Model
{
    /** @use HasFactory<HomepageBannerFactory> */
    use HasFactory;

    protected $fillable = [
        'asset_id',
        'target_category_id',
        'display_order',
        'is_published',
        'start_at',
        'end_at',
        // Optional overlay text (BE1). Nullable because null is a real state:
        // "image only, no overlay" (design.md §3.7 marks the overlay optional).
        'headline',
        'subtitle',
    ];

    protected $casts = [
        'is_published' => 'boolean',
        'start_at' => 'datetime',
        'end_at' => 'datetime',
    ];

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'asset_id');
    }

    public function targetCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'target_category_id');
    }
}
