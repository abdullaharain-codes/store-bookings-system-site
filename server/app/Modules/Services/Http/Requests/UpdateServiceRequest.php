<?php

namespace App\Modules\Services\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateServiceRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by the 'admin' middleware
     * applied to the entire /admin/* route group (rules.md §5). All fields are
     * optional so partial updates only touch the submitted keys.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
            ],
            'description' => ['sometimes', 'nullable', 'string'],
            // The cross-field check only applies when both prices are submitted
            // together; a lone price change is validated against the stored
            // counterpart by ServiceService (the authoritative check), so a
            // partial update cannot be rejected against an absent field.
            'price_min' => ['sometimes', 'numeric', 'min:0', Rule::when($this->filled('price_max'), 'lte:price_max')],
            'price_max' => ['sometimes', 'numeric', 'min:0'],
            'duration_minutes' => ['sometimes', 'integer', 'min:1'],
            // Deliberately no is_published field — publication changes go
            // through the dedicated audit-logged publish/unpublish endpoints.
        ];
    }
}
