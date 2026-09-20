<?php

namespace App\Models;

use Database\Factories\ReviewFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A customer review of a product or service (PRD §11 sidebars, ReleasePlan
 * §12). Exactly ONE of the two targets is set — the schema holds both as
 * nullable columns but the service layer enforces the XOR (see ReviewService).
 *
 * verified_source records WHICH purchase fact granted the write ('order' for
 * a product delivered to the reviewer, 'service_booking' for a completed
 * booking), and source_id points at that granting row (orders.id or
 * service_bookings.id). It is a traceability pair, not a constraint.
 *
 * A review is created live (is_published = true). The publish state is admin-
 * owned and only ever touched via publish()/unpublish() in ReviewService — it
 * is never a generic-update attribute.
 */
class Review extends Model
{
    /** @use HasFactory<ReviewFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'product_id',
        'service_id',
        'rating',
        'comment',
        'verified_source',
        'source_id',
        'is_published',
    ];

    protected $casts = [
        'rating' => 'integer',
        'is_published' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }
}
