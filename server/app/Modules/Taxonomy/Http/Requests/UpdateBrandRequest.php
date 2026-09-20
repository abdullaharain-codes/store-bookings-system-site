<?php

namespace App\Modules\Taxonomy\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBrandRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by the 'admin' middleware
     * applied to the entire /admin/* route group (rules.md §5). Note: there is
     * deliberately no is_published field — publication changes go through the
     * dedicated audit-logged publish/unpublish endpoints.
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
            'logo_asset_id' => ['sometimes', 'nullable', 'integer', 'exists:assets,id'],
        ];
    }
}
