<?php

namespace App\Modules\Scheduling\Http\Requests;

use App\Models\Holiday;
use Illuminate\Foundation\Http\FormRequest;

class StoreHolidayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        $data = parent::validationData();
        $raw = json_decode((string) $this->getContent(), true);
        if (is_array($raw) && array_key_exists('date', $raw)) {
            $data['date'] = $raw['date'];
        }

        return $data;
    }

    public function rules(): array
    {
        return [
            'date' => [
                'required',
                'date_format:Y-m-d',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value)) {
                        return;
                    }

                    $exists = Holiday::query()
                        ->whereDate('date', $value)
                        ->exists();

                    if ($exists) {
                        $fail('The date has already been taken.');
                    }
                },
            ],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
