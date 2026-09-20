<?php

namespace App\Modules\Services\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreServiceRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by the 'admin' middleware
     * (EnsureUserIsAdmin) applied to the entire /admin/* route group — a single
     * guard covers every admin endpoint so none can be forgotten (rules.md §5).
     * FormRequests therefore only validate input shape.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
            ],
            'description' => ['nullable', 'string'],
            // Cross-field rule (PRD §10): lte compares against the submitted
            // price_max, keeping the invariant enforced at the request boundary.
            'price_min' => ['required', 'numeric', 'min:0', 'lte:price_max'],
            'price_max' => ['required', 'numeric', 'min:0'],
            'duration_minutes' => ['required', 'integer', 'min:1'],
            'is_published' => ['nullable', 'boolean'],
        ];
    }
}
