<?php

namespace App\Modules\Scheduling\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

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
            'address_id' => ['nullable', 'integer', 'exists:addresses,id'],
            'problem_description' => ['nullable', 'string'],
        ];
    }
}
