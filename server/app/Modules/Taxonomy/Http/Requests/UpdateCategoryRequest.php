<?php

namespace App\Modules\Taxonomy\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCategoryRequest extends FormRequest
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
            // Not nullable: the column is NOT NULL with a default of 0; an
            // explicit null must be a clean 422, not a database error.
            'display_order' => ['sometimes', 'integer', 'min:0'],
            'logo_asset_id' => ['sometimes', 'nullable', 'integer', 'exists:assets,id'],
            'banner_asset_id' => ['sometimes', 'nullable', 'integer', 'exists:assets,id'],
            'parent_category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
        ];
    }
}
