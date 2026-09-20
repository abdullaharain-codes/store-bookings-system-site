<?php

namespace App\Modules\Catalog\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProductRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by the 'admin' middleware
     * applied to the entire /admin/* route group (rules.md §5). All fields are
     * optional so partial updates only touch the submitted keys. Note: there
     * is deliberately no is_published field — publication changes go through
     * the dedicated audit-logged publish/unpublish endpoints.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $slugPattern = 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/';

        return [
            // name/sku/price are NOT nullable: their columns are NOT NULL, so
            // an explicit null must be a clean 422, not a database error (same
            // reasoning as Taxonomy's display_order fix).
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', $slugPattern],
            'sku' => ['sometimes', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'stock_quantity' => ['sometimes', 'integer', 'min:0'],
            'brand_id' => ['sometimes', 'nullable', 'integer', 'exists:brands,id'],
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'image_asset_ids' => ['sometimes', 'array'],
            'image_asset_ids.*' => ['integer', 'exists:assets,id'],
        ];
    }
}
