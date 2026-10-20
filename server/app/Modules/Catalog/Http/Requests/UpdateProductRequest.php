<?php

namespace App\Modules\Catalog\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

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
            // Optional "was price" (DISCOUNT-1). Same rules as price, plus the
            // strictly-greater-than check in after() — which validates against
            // the EFFECTIVE price (the new one if sent, else the stored one).
            'compare_at_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'stock_quantity' => ['sometimes', 'integer', 'min:0'],
            'brand_id' => ['sometimes', 'nullable', 'integer', 'exists:brands,id'],
            // Merchandising flag (BE2). 'sometimes' so an update that omits it
            // leaves it untouched, and NOT nullable because the column is
            // NOT NULL — an explicit null is a clean 422, not a DB error. Both
            // true and false are accepted, so an admin can feature AND unfeature
            // a product through this one endpoint.
            'is_featured' => ['sometimes', 'boolean'],
            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'image_asset_ids' => ['sometimes', 'array'],
            'image_asset_ids.*' => ['integer', 'exists:assets,id'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $product = $this->route('product');

                // Effective values: use the submitted one when present, the
                // stored one otherwise. Empty strings are converted to null by
                // ConvertEmptyStringsToNull before we get here, which is the
                // "clear the discount" path — no cross-field check applies.
                $effectivePrice = $this->has('price')
                    ? $this->input('price')
                    : ($product?->price ?? null);
                $effectiveCompareAt = $this->has('compare_at_price')
                    ? $this->input('compare_at_price')
                    : ($product?->compare_at_price ?? null);

                if ($effectiveCompareAt !== null
                    && $effectiveCompareAt !== ''
                    && (float) $effectiveCompareAt <= (float) $effectivePrice) {
                    $validator->errors()->add(
                        'compare_at_price',
                        'The compare-at price must be strictly greater than the selling price.',
                    );
                }
            },
        ];
    }
}
