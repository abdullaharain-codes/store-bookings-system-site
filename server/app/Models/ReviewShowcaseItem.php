<?php

namespace App\Models;

use Database\Factories\ReviewShowcaseItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Review Showcase carousel item (architecture.md §4 — review-showcase domain
 * module).
 *
 * An admin-curated screenshot of a REAL customer review (captured on upload as
 * an Asset, never referenced or joined to the reviews table — the screenshot
 * alone is the content). The asset FK is RESTRICT, mirroring homepage_banners:
 * an image in use by a live showcase item must not evaporate under it.
 */
class ReviewShowcaseItem extends Model
{
    /** @use HasFactory<ReviewShowcaseItemFactory> */
    use HasFactory;

    protected $fillable = [
        'asset_id',
        'caption',
        'display_order',
        'is_published',
    ];

    protected $casts = [
        'is_published' => 'boolean',
    ];

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'asset_id');
    }
}
