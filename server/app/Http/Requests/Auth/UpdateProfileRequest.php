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
     * Mutable profile fields. `name` and `gender` can be updated; email is
     * deliberately absent because it is the login identifier and this codebase
     * has no verification/re-confirmation flow for changing it.
     *
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'gender' => ['sometimes', 'in:male,female,other'],
        ];
    }
}
