<?php

namespace App\Models;

use Database\Factories\HolidayFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A single blocked calendar date (architecture.md §4 "Holiday/BlockedSlot"):
 * the shop is unavailable all day, so slot generation must skip it entirely.
 * The unique date constraint enforces one row per blocked day.
 */
class Holiday extends Model
{
    /** @use HasFactory<HolidayFactory> */
    use HasFactory;

    protected $fillable = [
        'date',
        'reason',
    ];

    protected $casts = [
        'date' => 'date:Y-m-d',
    ];
}
