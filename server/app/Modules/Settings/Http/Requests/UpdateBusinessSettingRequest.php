<?php

namespace App\Modules\Settings\Http\Requests;

use App\Modules\Scheduling\Support\BusinessClock;
use Illuminate\Foundation\Http\FormRequest;

class UpdateBusinessSettingRequest extends FormRequest
{
    /**
     * Business settings whose value is a money amount. They are seeded with a
     * plain 'string' type (the generic type system has no money case), so
     * without a per-key rule the default branch below would accept any string
     * ('abc', '-5', '1.999') and store it as the platform shipping fee.
     */
    private const MONEY_KEYS = ['shipping_fee'];

    public function authorize(): bool
    {
        return true; // Route-level admin middleware guards this endpoint.
    }

    /**
     * The value rule depends on the setting's declared type (architecture.md
     * §4.1): an 'email_notifications_enabled' row with type 'boolean' must
     * reject any non-boolean payload, an integer setting a non-integer, etc.
     * The row is already resolved by the {setting} route binding, so an
     * unknown key 404s before validation ever runs.
     *
     * @return array<string, mixed>
     */
    protected function prepareForValidation(): void
    {
        $setting = $this->route('setting');

        if ($setting?->key !== 'serviceable_cities' || ! is_array($this->input('value'))) {
            return;
        }

        $trimmed = array_map(
            static fn (mixed $city): mixed => is_string($city) ? trim($city) : $city,
            $this->input('value'),
        );

        $this->merge(['value' => $trimmed]);
    }

    public function rules(): array
    {
        $setting = $this->route('setting');

        // Per-key override for the one setting whose values are drawn from a fixed
        // vocabulary rather than a scalar type: an IANA zone identifier. Without
        // it a typo ('Asia/Karachii') would be accepted and then silently fall
        // back at read time, so the schedule would quietly run in the wrong zone.
        if ($setting->key === BusinessClock::SETTING_KEY) {
            return [
                'value' => ['required', 'string', 'timezone'],
            ];
        }

        // Money settings: a non-negative amount with at most two decimal places.
        if (in_array($setting->key, self::MONEY_KEYS, true)) {
            return [
                'value' => ['required', 'numeric', 'min:0', 'decimal:0,2'],
            ];
        }

        if ($setting->key === 'serviceable_cities') {
            return [
                'value' => [
                    'required',
                    'array',
                    'max:100',
                    function (string $attribute, mixed $value, \Closure $fail): void {
                        if (! is_array($value)) {
                            return;
                        }

                        $seen = [];
                        foreach ($value as $city) {
                            if (! is_string($city)) {
                                continue;
                            }

                            $normalized = mb_strtolower(trim($city));
                            if ($normalized === '') {
                                continue;
                            }

                            if (isset($seen[$normalized])) {
                                $fail('The serviceable cities list must not contain duplicate cities.');

                                return;
                            }

                            $seen[$normalized] = true;
                        }
                    },
                ],
                'value.*' => ['required', 'string', 'max:100'],
            ];
        }

        $valueRules = match ($setting->type) {
            'boolean' => ['required', 'boolean'],
            'integer' => ['required', 'integer'],
            'json' => ['required', 'json'],
            'text' => ['required', 'string'],
            default => ['required', 'string'],
        };

        return [
            'value' => $valueRules,
        ];
    }
}
