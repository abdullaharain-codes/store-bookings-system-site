<?php

namespace App\Modules\Scheduling\Services;

use App\Models\BusinessSetting;
use App\Modules\Scheduling\Contracts\BusinessHourRepositoryInterface;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use Illuminate\Support\Carbon;

class SlotGenerationService
{
    public function __construct(
        private readonly BusinessHourRepositoryInterface $businessHours,
        private readonly HolidayRepositoryInterface $holidays,
    ) {}

    /**
     * Pure, stateless slot generation for a single calendar date. No writes —
     * data is read only through the injected repositories and BusinessSetting.
     * Settings: 'service_buffer_minutes' (int, default 15) and
     * 'min_booking_notice_minutes' (int, default 60).
     *
     * A candidate slot is stepped by service duration + buffer; it is kept only
     * if its own window (duration only — buffer is never part of the bookable
     * window) fits entirely before closes_at.
     *
     * @return array<int, array{start: Carbon, end: Carbon}>
     */
    public function generateSlots(Carbon $date, int $serviceDurationMinutes): array
    {
        $date = $date->copy()->startOfDay();

        $businessHour = $this->businessHours->findByDayOfWeek((int) $date->dayOfWeek);

        if (! $businessHour
            || $businessHour->is_closed
            || $businessHour->opens_at === null
            || $businessHour->closes_at === null) {
            return [];
        }

        if ($this->holidays->existsOnDate($date)) {
            return [];
        }

        $duration = max(1, $serviceDurationMinutes);
        $stepMinutes = $duration + (int) BusinessSetting::getValue('service_buffer_minutes', 15);

        $opens = Carbon::parse($date->format('Y-m-d').' '.$businessHour->opens_at);
        $closes = Carbon::parse($date->format('Y-m-d').' '.$businessHour->closes_at);
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
     * @return array{start: Carbon, end: Carbon}|null
     */
    public function nearestAvailableSlot(Carbon $preferredDateTime, int $serviceDurationMinutes, int $searchDays = 14): ?array
    {
        if ($searchDays < 1) {
            return null;
        }

        for ($offset = 0; $offset < $searchDays; $offset++) {
            $date = $preferredDateTime->copy()->addDays($offset);

            foreach ($this->generateSlots($date, $serviceDurationMinutes) as $slot) {
                if ($slot['start'] >= $preferredDateTime) {
                    return $slot;
                }
            }
        }

        return null;
    }
}
