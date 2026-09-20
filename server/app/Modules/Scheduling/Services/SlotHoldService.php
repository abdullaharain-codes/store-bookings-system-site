<?php

namespace App\Modules\Scheduling\Services;

use App\Models\BusinessSetting;
use App\Models\SlotHold;
use App\Modules\Scheduling\Exceptions\SchedulingValidationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Creates and releases temporary holds on booking time windows.
 *
 * Follows the exact critical-section discipline of Phase 4's cart stock holds
 * (CartService::addItem): the overlap check and the insert run inside a single
 * DB::transaction(), and the overlap scan takes lockForUpdate() so two
 * concurrent transactions cannot both pass the overlap check before either
 * commits — one always observes the other's committed hold after the lock is
 * released.
 *
 * Engine notes (see config/database.php for the sqlite transaction_mode):
 *  - MySQL family (production): lockForUpdate() takes real row locks on the
 *    checked windows — the row-level critical section.
 *  - SQLite (dev/test): row locks are unsupported (SQLiteGrammar compiles them
 *    to ''), so the sqlite connection is configured with
 *    transaction_mode = IMMEDIATE. Every transaction takes the whole-file
 *    write lock at BEGIN — before the overlap read — which closes the
 *    read-skew window the same way row locks do on MySQL. lockForUpdate() is
 *    retained so the mechanism is uniform across engines.
 */
class SlotHoldService
{
    /**
     * Defensive invariant, checked before any query runs: a window with
     * startsAt >= endsAt is a programmer error (Phase 8's FormRequest should
     * catch it first; this is the last line of defense against a malformed
     * window slipping into the hold/overlap logic). A malformed window could
     * otherwise never overlap anything and yet still be insertable — a
     * double-booking slip-through vector. \InvalidArgumentException follows the
     * FileUploadService convention for programmer errors, distinct from the
     * business-rule SchedulingValidationException (→ 422).
     *
     * @throws \InvalidArgumentException
     */
    private function assertValidWindow(Carbon $startsAt, Carbon $endsAt): void
    {
        if (! $startsAt->lt($endsAt)) {
            throw new \InvalidArgumentException('The hold window must have startsAt before endsAt.');
        }
    }

    /**
     * @throws SchedulingValidationException if an active hold overlaps
     * @throws \InvalidArgumentException if startsAt >= endsAt
     */
    public function attemptHold(Carbon $startsAt, Carbon $endsAt, ?int $userId = null): SlotHold
    {
        $this->assertValidWindow($startsAt, $endsAt);

        $holdMinutes = (int) BusinessSetting::getValue('slot_hold_minutes', 10);

        return DB::transaction(function () use ($startsAt, $endsAt, $userId, $holdMinutes) {
            $this->assertNoActiveOverlap($startsAt, $endsAt);

            return SlotHold::query()->create([
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'held_by_user_id' => $userId,
                'expires_at' => now()->addMinutes($holdMinutes),
            ]);
        });
    }

    /**
     * Explicit release (e.g. the customer abandons the booking flow). The
     * window becomes immediately available to the next attemptHold.
     */
    public function releaseHold(SlotHold $hold): void
    {
        $hold->delete();
    }

    /**
     * Read-only availability check for future (Phase 8) availability queries.
     * Never attempts a hold and never writes.
     *
     * @throws \InvalidArgumentException if startsAt >= endsAt
     */
    public function isWindowFree(Carbon $startsAt, Carbon $endsAt): bool
    {
        $this->assertValidWindow($startsAt, $endsAt);

        return ! SlotHold::query()
            ->active()
            ->overlappingWith($startsAt, $endsAt)
            ->exists();
    }

    /**
     * @throws SchedulingValidationException
     */
    private function assertNoActiveOverlap(Carbon $startsAt, Carbon $endsAt): void
    {
        $overlapping = SlotHold::query()
            ->active()
            ->overlappingWith($startsAt, $endsAt)
            ->lockForUpdate()
            ->first();

        if ($overlapping) {
            throw new SchedulingValidationException('This time slot is no longer available. Please choose a different time.');
        }
    }
}
