<?php

namespace App\Modules\Merchandising\Http\Requests;

use App\Modules\Merchandising\Support\BannerOverlayTextRules;
use Illuminate\Foundation\Http\FormRequest;

class StoreBannerRequest extends FormRequest
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
            'asset_id' => ['required', 'integer', 'exists:assets,id'],
            'target_category_id' => ['required', 'integer', 'exists:categories,id'],
            'display_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'is_published' => ['sometimes', 'boolean'],
            'start_at' => ['sometimes', 'nullable', 'date'],
            'end_at' => ['sometimes', 'nullable', 'date'],
            // Optional overlay text (BE1). Shared with UpdateBannerRequest so
            // create and update cannot drift (rules.md §3 DRY).
            'headline' => BannerOverlayTextRules::headline(),
            'subtitle' => BannerOverlayTextRules::subtitle(),
        ];
    }
}
