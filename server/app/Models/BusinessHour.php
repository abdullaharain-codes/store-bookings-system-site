<?php

namespace App\Models;

use Database\Factories\BusinessHourFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Weekly opening schedule for the shop (Scheduling module, PRD §10 /
 * architecture.md §4 "BusinessHours").
 *
 * day_of_week uses PHP's date('w') / Carbon dayOfWeek numbering —
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday. Exactly one row per weekday
 * (DB unique constraint). There is no is_closed = false row without an open
 * interval; a row with null times must have is_closed = true.
 */
class BusinessHour extends Model
{
    /** @use HasFactory<BusinessHourFactory> */
    use HasFactory;

    protected $fillable = [
        'day_of_week',
        'opens_at',
        'closes_at',
        'is_closed',
    ];

    protected $casts = [
        'is_closed' => 'boolean',
        // TIME columns. Laravel has no built-in time cast in this version
        // ($primitiveCastTypes has none of that name), and no time-only field
        // exists elsewhere in the codebase to copy, so these stay plain
        // strings ('H:i:s'). Zero-padded 24-hour times compare correctly
        // lexicographically, which is all the later slot math needs.
        'opens_at' => 'string',
        'closes_at' => 'string',
    ];
}
