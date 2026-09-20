<?php

namespace App\Modules\Taxonomy\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCategoryRequest extends FormRequest
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
            'display_order' => ['nullable', 'integer', 'min:0'],
            'is_published' => ['nullable', 'boolean'],
            'logo_asset_id' => ['nullable', 'integer', 'exists:assets,id'],
            'banner_asset_id' => ['nullable', 'integer', 'exists:assets,id'],
            'parent_category_id' => ['nullable', 'integer', 'exists:categories,id'],
        ];
    }
}
