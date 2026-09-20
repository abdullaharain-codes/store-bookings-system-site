<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Route-level auth:sanctum middleware guards this endpoint.
    }

    /**
     * The profile's mutable fields. Only `name` exists to change: the users
     * table is name/email/password (no phone column), and email is deliberately
     * absent — it is the login identifier, and this codebase has no
     * verification/re-confirmation flow to re-prove ownership of a new one
     * (see ProfileService::updateProfile for the reasoning).
     *
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
        ];
    }
}
