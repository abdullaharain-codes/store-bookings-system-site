<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Route-level auth:sanctum middleware guards this endpoint.
    }

    /**
     * `new_password` must clear the SAME strength gate as registration
     * (RegisterRequest::baseRules): min:8, plus the HTTP-only 'confirmed'
     * field gate. No separate, stricter rule is invented here (rules.md §3
     * DRY). The CURRENT password is verified against the stored hash in
     * ProfileService — proving ownership (rules.md §9) before any change.
     *
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8', 'confirmed'],
        ];
    }
}
