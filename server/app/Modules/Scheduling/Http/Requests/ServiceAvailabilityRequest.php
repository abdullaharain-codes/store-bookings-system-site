<?php

namespace App\Modules\Scheduling\Http\Requests;

use App\Models\BusinessSetting;
use App\Modules\Scheduling\Support\BusinessClock;
use Illuminate\Foundation\Http\FormRequest;

class ServiceAvailabilityRequest extends FormRequest
{
    /**
     * Public endpoint: guests browse the wizard and the flow preserves step data
     * across login (PRD §5.1), so availability must be readable with no session.
     * The route carries no auth middleware for the same reason.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function __construct(private readonly BusinessClock $clock) {}

    public function rules(): array
    {
        // "Today" and the booking horizon are BUSINESS-LOCAL calendar days
        // (TZ1). At 22:00 UTC on the 20th it is already the 21st in Asia/Karachi,
        // and using the UTC date here would offer a day that has already begun.
        $today = $this->clock->today();

        return [
            // Explicit Y-m-d, not `date`: the engine works in whole calendar days,
            // and accepting "next friday" would make the response's `date` field
            // disagree with what the caller asked for.
            'date' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:'.$today->format('Y-m-d'),
                'before_or_equal:'.$today->copy()->addDays($this->maxAdvanceDays())->format('Y-m-d'),
            ],
            // phases.md Phase 7 lists "nearest-slot suggestion logic" as part of
            // the scheduling engine, so it rides the same route as a mode switch
            // rather than adding a second endpoint.
            'mode' => ['nullable', 'in:list,nearest'],
        ];
    }

    public function messages(): array
    {
        return [
            'date.after_or_equal' => 'The date cannot be in the past.',
            'date.before_or_equal' => 'Bookings cannot be made that far in advance.',
        ];
    }

    public function attributes(): array
    {
        return ['date' => 'date'];
    }

    /**
     * Configurable booking horizon (rules.md §6 — not a code constant). Falls back
     * to 60 so the endpoint still behaves if the setting row is ever missing.
     */
    private function maxAdvanceDays(): int
    {
        return (int) BusinessSetting::getValue('booking_max_advance_days', 60);
    }
}
