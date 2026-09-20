<?php

namespace App\Modules\Reviews\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Review submission payload. Field-level rules only — the "exactly one of
 * product_id/service_id" XOR and the purchase-eligibility checks belong to
 * ReviewService (they need repository access and produce business-rule 422s,
 * not field errors).
 */
class SubmitReviewRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:2000'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'service_id' => ['nullable', 'integer', 'exists:services,id'],
        ];
    }
}
