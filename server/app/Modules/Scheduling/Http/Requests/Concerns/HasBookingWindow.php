<?php

namespace App\Modules\Scheduling\Http\Requests\Concerns;

use Illuminate\Support\Carbon;

trait HasBookingWindow
{
    /**
     * @return array<string, array<int, mixed>>
     */
    protected function bookingWindowRules(): array
    {
        return [
            'scheduled_slot_start' => ['required', 'date'],
            'scheduled_slot_end' => ['required', 'date', 'after:scheduled_slot_start'],
        ];
    }

    /**
     * @return array{scheduled_slot_start: Carbon, scheduled_slot_end: Carbon}
     */
    public function window(): array
    {
        return [
            'scheduled_slot_start' => $this->date('scheduled_slot_start')->setTimezone(config('app.timezone')),
            'scheduled_slot_end' => $this->date('scheduled_slot_end')->setTimezone(config('app.timezone')),
        ];
    }
}
