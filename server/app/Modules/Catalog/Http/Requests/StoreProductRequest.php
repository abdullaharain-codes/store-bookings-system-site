<?php

namespace App\Modules\Catalog\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

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
            // Optional "was price" (DISCOUNT-1). Mirrors price's rules: same
            // min, no max. The strictly-greater-than check lives in after().
            'compare_at_price' => ['nullable', 'numeric', 'min:0'],
            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            // Nullable FK: a product is valid without a brand.
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'is_published' => ['nullable', 'boolean'],
            // Merchandising flag (BE2). Nullable in the request but never null
            // in the database: absent/null both mean "not featured".
            'is_featured' => ['nullable', 'boolean'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'image_asset_ids' => ['nullable', 'array'],
            'image_asset_ids.*' => ['integer', 'exists:assets,id'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $price = $this->input('price');
                $compareAt = $this->input('compare_at_price');

                if ($compareAt !== null && $compareAt !== '' && (float) $compareAt <= (float) $price) {
                    $validator->errors()->add(
                        'compare_at_price',
                        'The compare-at price must be strictly greater than the selling price.',
                    );
                }
            },
        ];
    }
}
