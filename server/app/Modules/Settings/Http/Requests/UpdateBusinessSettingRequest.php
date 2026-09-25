<?php

namespace App\Modules\Settings\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBusinessSettingRequest extends FormRequest
{
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
    public function rules(): array
    {
        $setting = $this->route('setting');

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
