<?php

namespace App\Modules\Catalog\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCartItemQuantityRequest extends FormRequest
{
    /**
     * Authorization is enforced at the route level by auth:sanctum — any
     * authenticated user acting on their own resource (rules.md §5, not
     * an admin-role check). 0 is valid here: CartService delegates to
     * removeItem when quantity is 0.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'quantity' => ['required', 'integer', 'min:0'],
        ];
    }
}
