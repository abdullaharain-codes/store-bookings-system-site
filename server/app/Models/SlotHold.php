<?php

namespace App\Models;

use Database\Factories\SlotHoldFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A temporary hold on a booking time window (architecture.md §4.2).
 *
 * Active-hold semantics: a hold counts against availability only while
 * expires_at > now(). Expired holds are invisible to every overlap check, so
 * "available" is computed live at query time — no cleanup-cron dependency.
 *
 * The held window is a half-open interval [starts_at, ends_at). Two windows
 * overlap iff a_start < b_end AND b_start < a_end; windows that merely touch
 * (a_end == b_start) do NOT overlap.
 */
class SlotHold extends Model
{
    /** @use HasFactory<SlotHoldFactory> */
    use HasFactory;

    protected $fillable = [
        'starts_at',
        'ends_at',
        'held_by_user_id',
        'expires_at',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    /**
     * Only holds that are still live — expired holds must be invisible to
     * every availability and overlap decision.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('expires_at', '>', now());
    }

    /**
     * Holds whose [starts_at, ends_at) overlaps the requested half-open
     * window. Deliberately isolated here as the single named predicate that
     * the whole phase's correctness hangs on:
     *
     *   window.starts_at < requested.ends_at AND window.ends_at > requested.starts_at
     */
    public function scopeOverlappingWith(Builder $query, Carbon $startsAt, Carbon $endsAt): Builder
    {
        return $query
            ->where('starts_at', '<', $endsAt)
            ->where('ends_at', '>', $startsAt);
    }
}
