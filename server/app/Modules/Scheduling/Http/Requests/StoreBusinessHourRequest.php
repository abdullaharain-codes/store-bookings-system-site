<?php

namespace App\Modules\Scheduling\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBusinessHourRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $isClosed = $this->boolean('is_closed');

        $timeRules = $isClosed
            ? ['nullable', 'date_format:H:i,H:i:s']
            : ['required', 'date_format:H:i,H:i:s'];

        return [
            'day_of_week' => ['required', 'integer', 'between:0,6', Rule::unique('business_hours', 'day_of_week')],
            'is_closed' => ['required', 'boolean'],
            'opens_at' => $timeRules,
            'closes_at' => array_merge($timeRules, $isClosed ? [] : [
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $open = $this->input('opens_at');
                    if (is_string($open) && is_string($value) && strtotime($value) <= strtotime($open)) {
                        $fail('The closes at must be after opens at.');
                    }
                },
            ]),
        ];
    }
}
