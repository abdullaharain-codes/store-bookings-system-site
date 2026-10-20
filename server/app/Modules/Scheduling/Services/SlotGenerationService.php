<?php

namespace App\Modules\Scheduling\Services;

use App\Models\BusinessSetting;
use App\Modules\Scheduling\Contracts\BusinessHourRepositoryInterface;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use App\Modules\Scheduling\Support\BusinessClock;
use Illuminate\Support\Carbon;

class SlotGenerationService
{
    public function __construct(
        private readonly BusinessHourRepositoryInterface $businessHours,
        private readonly HolidayRepositoryInterface $holidays,
        private readonly BusinessClock $clock,
    ) {}

    /**
     * Pure, stateless slot generation for a single BUSINESS-LOCAL calendar date.
     * No writes — data is read only through the injected repositories and
     * BusinessSetting. Settings: 'business_timezone' (string, default
     * Asia/Karachi), 'service_buffer_minutes' (int, default 15) and
     * 'min_booking_notice_minutes' (int, default 60).
     *
     * Every wall-clock interpretation goes through BusinessClock (TZ1): the
     * weekday lookup, the holiday match and the open/close instants are all
     * business-local. The returned slots are absolute INSTANTS in the app zone
     * (UTC), so callers store and compare them exactly as before.
     *
     * A candidate slot is stepped by service duration + buffer; it is kept only
     * if its own window (duration only — buffer is never part of the bookable
     * window) fits entirely before closes_at.
     *
     * @return array<int, array{start: Carbon, end: Carbon}>
     */
    public function generateSlots(Carbon $date, int $serviceDurationMinutes): array
    {
        $localDate = $this->clock->localDate($date);

        $businessHour = $this->businessHours->findByDayOfWeek((int) $localDate->dayOfWeek);

        if (! $businessHour
            || $businessHour->is_closed
            || $businessHour->opens_at === null
            || $businessHour->closes_at === null) {
            return [];
        }

        // holidays.date is a BUSINESS-LOCAL calendar date, so it is matched on
        // the business-local day - not on whatever UTC date that day's slots
        // happen to fall in.
        if ($this->holidays->existsOnDate($localDate)) {
            return [];
        }

        $duration = max(1, $serviceDurationMinutes);
        $stepMinutes = $duration + (int) BusinessSetting::getValue('service_buffer_minutes', 15);

        $opens = $this->clock->instant($localDate, $businessHour->opens_at);
        $closes = $this->clock->instant($localDate, $businessHour->closes_at);

        // Minimum notice is a DURATION from now, so it is a pure instant
        // comparison and needs no timezone of its own.
        $notBefore = Carbon::now()->addMinutes((int) BusinessSetting::getValue('min_booking_notice_minutes', 60));

        $slots = [];

        for ($start = $opens->copy(); $start < $closes; $start->addMinutes($stepMinutes)) {
            if ($start < $notBefore) {
                continue;
            }

            $end = $start->copy()->addMinutes($duration);

            if ($end > $closes) {
                continue;
            }

            $slots[] = ['start' => $start->copy(), 'end' => $end];
        }

        return $slots;
    }

    /**
     * First slot no earlier than $preferredDateTime, searching that date and
     * each following day up to $searchDays total. Null when the range is
     * exhausted without a single valid slot.
     *
     * $isBookable is an optional predicate applied to each candidate as
     * `fn (array $slot): bool` (true = keep). It exists so a caller that also has
     * to consider live occupancy — holds and existing bookings — can reuse this
     * day-walking loop instead of reimplementing it (rules.md §3 DRY). Defaults
     * to null, which keeps this method's original pure hours/holidays/buffer/
     * notice behaviour, so the nearest-slot unit tests are unaffected.
     *
     * @return array{start: Carbon, end: Carbon}|null
     */
    public function nearestAvailableSlot(
        Carbon $preferredDateTime,
        int $serviceDurationMinutes,
        int $searchDays = 14,
        ?callable $isBookable = null,
    ): ?array {
        if ($searchDays < 1) {
            return null;
        }

        for ($offset = 0; $offset < $searchDays; $offset++) {
            $date = $preferredDateTime->copy()->addDays($offset);

            foreach ($this->generateSlots($date, $serviceDurationMinutes) as $slot) {
                if ($slot['start'] < $preferredDateTime) {
                    continue;
                }

                if ($isBookable !== null && ! $isBookable($slot)) {
                    continue;
                }

                return $slot;
            }
        }

        return null;
    }
}
