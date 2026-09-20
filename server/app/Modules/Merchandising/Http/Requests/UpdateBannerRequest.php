<?php

namespace App\Modules\Merchandising\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBannerRequest extends FormRequest
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
            // The banner image is REQUIRED — a hero banner without one is
            // meaningless (design.md §3.7). Only the target may move.
            'asset_id' => ['sometimes', 'required', 'integer', 'exists:assets,id'],
            'target_category_id' => ['sometimes', 'required', 'integer', 'exists:categories,id'],
            'display_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'start_at' => ['sometimes', 'nullable', 'date'],
            'end_at' => ['sometimes', 'nullable', 'date'],
            // is_published is deliberately absent — publish state is owned by
            // the explicit publish/unpublish actions (mirrors categories).
        ];
    }
}
