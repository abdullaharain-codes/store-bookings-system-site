<?php

namespace App\Modules\Scheduling\Http\Requests;

use App\Modules\Scheduling\Support\BookingDeviceTypes;
use App\Modules\Scheduling\Support\BookingIssueTypes;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class StoreBookingRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by auth:sanctum — any
     * authenticated user acting on their own resource (rules.md §5, not
     * an admin-role check).
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'scheduled_slot_start' => ['required', 'date'],
            'scheduled_slot_end' => ['required', 'date', 'after:scheduled_slot_start'],
            'address_id' => ['required', 'integer', 'exists:addresses,id'],
            'issue_type' => ['required', Rule::in(BookingIssueTypes::all())],
            'device_type' => ['required', Rule::in(BookingDeviceTypes::all())],
            'brand' => ['required', 'string', 'max:100'],
            'model' => ['nullable', 'string', 'max:100'],
            'problem_description' => ['required', 'string', 'min:10', 'max:2000'],
        ];
    }

    /**
     * Normalise both window edges to the app zone (UTC) before the service layer
     * sees them (TZ1).
     *
     * The availability endpoint now returns slot times in the BUSINESS zone
     * ("2026-09-21T09:00:00+05:00") because that is the wall-clock time the
     * customer recognises. A client posts that string straight back. Carbon::parse()
     * would honour the +05:00 offset and yield an instance in +05:00, and Eloquent
     * formats a datetime cast in the INSTANCE's zone — so 09:00+05:00 would be
     * written to the column as 09:00 and silently read back as 09:00 UTC, i.e.
     * five hours late. Converting here keeps "instants are stored in UTC" true
     * for every offset a client might send.
     *
     * This is input normalisation only: no validation rule, no booking or
     * hold/overlap logic is touched.
     *
     * @return array<string, Carbon>
     */
    public function window(): array
    {
        return [
            'scheduled_slot_start' => $this->date('scheduled_slot_start')->setTimezone(config('app.timezone')),
            'scheduled_slot_end' => $this->date('scheduled_slot_end')->setTimezone(config('app.timezone')),
        ];
    }
}
