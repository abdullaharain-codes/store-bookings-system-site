<?php

namespace App\Modules\ReviewShowcase\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReviewShowcaseItemRequest extends FormRequest
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
            // The showcase image is REQUIRED — a carousel entry without one is
            // meaningless (SRS §3.4 showcase image rules). Accepts an existing
            // asset_id only; uploading happens via the standard asset flow
            // (Phase 12 hardening item #10), never here.
            'asset_id' => ['required', 'integer', 'exists:assets,id'],
            'caption' => ['sometimes', 'nullable', 'string', 'max:500'],
            'display_order' => ['sometimes', 'nullable', 'integer', 'min:0'],
            // is_published deliberately absent — publish state is owned by the
            // explicit publish/unpublish actions.
        ];
    }
}
