<?php

namespace App\Modules\Merchandising\Http\Requests;

use App\Modules\Merchandising\Support\BannerOverlayTextRules;
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
            'asset_id' => ['sometimes', 'required', 'integer', 'exists:assets,id'],
            'target_category_id' => ['sometimes', 'required', 'integer', 'exists:categories,id'],
            'display_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'start_at' => ['sometimes', 'nullable', 'date'],
            'end_at' => ['sometimes', 'nullable', 'date'],
            // Optional overlay text (BE1), same rules as create (DRY).
            //
            // Sending null clears the overlay, and Laravel's
            // ConvertEmptyStringsToNull middleware turns "" into null first, so
            // "" clears it too. That is how an admin removes the text from a
            // banner without deleting and re-creating it.
            'headline' => BannerOverlayTextRules::headline(),
            'subtitle' => BannerOverlayTextRules::subtitle(),
            // is_published is intentionally NOT updatable here: publishing goes
            // through the dedicated publish/unpublish endpoints.
        ];
    }
}
