<?php

namespace App\Models;

use Database\Factories\ServiceBookingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ServiceBooking extends Model
{
    /** @use HasFactory<ServiceBookingFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'service_id',
        'technician_id',
        'address_id',
        'scheduled_slot_start',
        'scheduled_slot_end',
        'status',
        'problem_description',
        'final_price',
        'cancelled_at',
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
}
