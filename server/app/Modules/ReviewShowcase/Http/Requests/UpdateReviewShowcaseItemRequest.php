<?php

namespace App\Modules\ReviewShowcase\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateReviewShowcaseItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Route-level admin middleware guards this endpoint.
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Same asset rule as create — the showcase image is REQUIRED.
            'asset_id' => ['sometimes', 'required', 'integer', 'exists:assets,id'],
            'caption' => ['sometimes', 'nullable', 'string', 'max:500'],
            'display_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
            // is_published deliberately absent — publish state is owned by the
            // explicit publish/unpublish actions (mirrors categories/banners).
        ];
    }
}
