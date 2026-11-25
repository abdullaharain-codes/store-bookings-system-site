<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    /**
     * Credential rules shared by HTTP registration and admin provisioning
     * (`admin:create`) — single source of truth so the two paths can never
     * drift apart on strength/format requirements (rules.md §3 DRY).
     *
     * @return array<string, list<string>>
     */
    public static function baseRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            // Minimum length here only; 'confirmed' below is an HTTP-only
            // concern (there is no confirmation field on the console).
            'password' => ['required', 'string', 'min:8'],
            'gender' => ['required', 'in:male,female,other'],
        ];
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        $rules = static::baseRules();
        $rules['password'][] = 'confirmed';

        return $rules;
    }

    public function authorize(): bool
    {
        return true;
    }
}
