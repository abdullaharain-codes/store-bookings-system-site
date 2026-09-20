<?php

namespace App\Modules\ReviewShowcase\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReorderReviewShowcaseItemsRequest extends FormRequest
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
            'ordered_ids' => ['required', 'array', 'min:1'],
            'ordered_ids.*' => ['required', 'integer', 'distinct', 'exists:review_showcase_items,id'],
        ];
    }
}
