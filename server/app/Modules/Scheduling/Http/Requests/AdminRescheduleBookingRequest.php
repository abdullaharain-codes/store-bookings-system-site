<?php

namespace App\Modules\Scheduling\Http\Requests;

use App\Modules\Scheduling\Http\Requests\Concerns\HasBookingWindow;
use Illuminate\Foundation\Http\FormRequest;

class AdminRescheduleBookingRequest extends FormRequest
{
    use HasBookingWindow;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return array_merge($this->bookingWindowRules(), [
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);
    }
}
