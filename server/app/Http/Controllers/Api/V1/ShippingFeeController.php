<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Orders\Services\ShippingFeeService;
use Illuminate\Http\JsonResponse;

/**
 * Public read of the platform-wide flat shipping fee (D2).
 *
 * The storefront shows this at checkout BEFORE an order is placed. The value
 * comes from ShippingFeeService — the same service OrderService uses when it
 * stores shipping_fee on the order — so the two can never disagree. Nothing
 * else from the business settings table is exposed: exactly one field.
 */
class ShippingFeeController extends Controller
{
    public function __construct(private readonly ShippingFeeService $shippingFee) {}

    public function show(): JsonResponse
    {
        return response()->json(['shipping_fee' => $this->shippingFee->current()]);
    }
}
