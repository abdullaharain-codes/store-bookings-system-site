<?php

namespace App\Models;

use Database\Factories\ServiceBookingFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;

class ServiceBooking extends Model
{
    /** @use HasFactory<ServiceBookingFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'service_id',
        'technician_id',
        'address_id',
        'recipient_name',
        'phone',
        'address_line_1',
        'address_line_2',
        'city',
        'postal_code',
        'map_link',
        'customer_gender',
        'scheduled_slot_start',
        'scheduled_slot_end',
        'status',
        'problem_description',
        'issue_type',
        'device_type',
        'brand',
        'model',
        'final_price',
        'cancelled_at',
        'cancellation_reason',
        'cancellation_note',
        'rescheduled_from_id',
    ];

    protected $casts = [
        'scheduled_slot_start' => 'datetime',
        'scheduled_slot_end' => 'datetime',
        'final_price' => 'decimal:2',
        'cancelled_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * The assigned technician (a user). Null until manually assigned
     * (architecture.md §12: single-technician is a data value, not structural).
     */
    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function address(): BelongsTo
    {
        return $this->belongsTo(Address::class);
    }

    /**
     * The booking this one was rescheduled from (architecture.md §4).
     */
    public function rescheduledFrom(): BelongsTo
    {
        return $this->belongsTo(ServiceBooking::class, 'rescheduled_from_id');
    }

    /**
     * The booking this one was rescheduled into (inverse of rescheduledFrom).
     */
    public function rescheduledTo(): HasOne
    {
        return $this->hasOne(ServiceBooking::class, 'rescheduled_from_id');
    }

    /**
     * Bookings that still own their window: anything not cancelled.
     *
     * Extracted so the read side (the public availability endpoint) and the write
     * side (BookingService's double-booking guard) share ONE named predicate
     * rather than each restating "status != cancelled". rules.md §3 requires the
     * "is this slot still bookable" rule to exist in a single place; a cancelled
     * row freeing its window is exactly the kind of rule that silently drifts
     * when it is written twice.
     */
    public function scopeNotCancelled(Builder $query): Builder
    {
        return $query->where('status', '!=', 'cancelled');
    }

    /**
     * Bookings whose [scheduled_slot_start, scheduled_slot_end) overlaps the
     * requested half-open window:
     *
     *   start < requested.ends_at AND end > requested.starts_at
     *
     * The mirror image of SlotHold::scopeOverlappingWith, and served by the same
     * composite (scheduled_slot_start, scheduled_slot_end) index.
     */
    public function scopeOverlappingWith(Builder $query, Carbon $startsAt, Carbon $endsAt): Builder
    {
        return $query
            ->where('scheduled_slot_start', '<', $endsAt)
            ->where('scheduled_slot_end', '>', $startsAt);
    }
}
