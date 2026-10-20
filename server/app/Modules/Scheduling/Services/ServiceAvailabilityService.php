<?php

namespace App\Modules\Scheduling\Services;

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Modules\Scheduling\Support\BusinessClock;
use Illuminate\Support\Carbon;

/**
 * Read-only availability for one service on one calendar date (Phase 7's
 * "availability API", consumed by the booking wizard's date/time step).
 *
 * This service owns NO scheduling rule of its own. It composes the two existing
 * sources of truth and adds nothing:
 *
 *  - WHICH windows exist at all (business hours, holidays, buffer, minimum
 *    notice) comes from SlotGenerationService — the same call the read path has
 *    always used, so the wizard can never be offered a slot the engine would
 *    refuse.
 *  - WHICH of those windows are currently TAKEN comes from SlotHoldService's
 *    read-only isWindowFree() and from ServiceBooking's notCancelled() /
 *    overlappingWith() scopes — the same two predicates BookingService uses when
 *    it finally writes the booking. rules.md §3 names this exact case: "is this
 *    slot still bookable" must exist in one place, and rules.md §8 requires the
 *    write path to re-validate regardless of what the UI showed.
 *
 * Purely a read: it never attempts a hold, never locks, and never writes.
 */
class ServiceAvailabilityService
{
    /**
     * The window for `mode=nearest` must not run past the same configurable
     * horizon the date validator enforces, or the endpoint could advertise a
     * date the wizard itself refuses to submit.
     */
    private const NEAREST_SEARCH_DAYS = 14;

    public function __construct(
        private readonly SlotGenerationService $slots,
        private readonly SlotHoldService $holds,
        private readonly BusinessClock $clock,
    ) {}

    /**
     * Bookable slots for $date, in the generator's order.
     *
     * @return array<int, array{start: Carbon, end: Carbon}>
     */
    public function slotsFor(Service $service, Carbon $date): array
    {
        $generated = $this->slots->generateSlots($this->clock->localDate($date), $service->duration_minutes);

        return array_values(array_filter(
            $generated,
            fn (array $slot) => $this->isBookable($slot),
        ));
    }

    /**
     * First bookable slot at or after the start of $date, searching forward
     * across days. Null when the search range is exhausted.
     *
     * The search starts at BUSINESS-LOCAL midnight of $date, so "the nearest slot
     * to this date" means the start of the customer's day, not the start of the
     * UTC day (which is five hours earlier in Asia/Karachi and would let a slot
     * from the previous business day leak in).
     *
     * @return array{start: Carbon, end: Carbon}|null
     */
    public function nearestSlotFor(Service $service, Carbon $date): ?array
    {
        $localDate = $this->clock->localDate($date);

        return $this->slots->nearestAvailableSlot(
            $this->clock->instant($localDate, '00:00:00'),
            $service->duration_minutes,
            self::NEAREST_SEARCH_DAYS,
            fn (array $slot) => $this->isBookable($slot),
        );
    }

    /**
     * The shared "is this window still bookable" predicate, applied identically
     * by both the list and nearest paths.
     *
     * @param  array{start: Carbon, end: Carbon}  $slot
     */
    private function isBookable(array $slot): bool
    {
        return $this->holds->isWindowFree($slot['start'], $slot['end'])
            && ! ServiceBooking::query()
                ->notCancelled()
                ->overlappingWith($slot['start'], $slot['end'])
                ->exists();
    }
}
