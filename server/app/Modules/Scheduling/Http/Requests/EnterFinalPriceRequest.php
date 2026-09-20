<?php

namespace App\Modules\Scheduling\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class EnterFinalPriceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // min:0 — a technician can waive a visit / service, but a final
            // actual price below zero is never valid.
            'final_price' => ['required', 'numeric', 'min:0'],
        ];
    }
}
