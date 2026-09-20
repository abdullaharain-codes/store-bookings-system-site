<?php

namespace App\Modules\Catalog\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by the 'admin' middleware
     * applied to the entire /admin/* route group — a single guard covers every
     * admin endpoint so none can be forgotten (rules.md §5). FormRequests
     * therefore only validate input shape.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $slugPattern = 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/';

        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', $slugPattern],
            // SKUs are assigned intentionally by the admin, never generated.
            'sku' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'numeric', 'min:0'],
            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            // Nullable FK: a product is valid without a brand.
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'is_published' => ['nullable', 'boolean'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'image_asset_ids' => ['nullable', 'array'],
            'image_asset_ids.*' => ['integer', 'exists:assets,id'],
        ];
    }
}
