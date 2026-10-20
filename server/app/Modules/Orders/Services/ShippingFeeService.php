<?php

namespace App\Modules\Orders\Services;

use App\Models\BusinessSetting;

/**
 * The single source of truth for the platform-wide flat shipping fee.
 *
 * The fee is a platform-wide BusinessSetting value (seeded at 200, stored as a
 * string — see the seed migration). Both order placement and the public
 * shipping-fee endpoint read it through this service so the value a customer
 * sees at checkout is provably the value the order stores (rules.md §3 DRY,
 * D2 owner decision).
 *
 * It is deliberately read live on every call — no caching — so an admin
 * changing the setting takes effect immediately.
 */
class ShippingFeeService
{
    /**
     * The current flat shipping fee as a 2-decimal money string (e.g. "200.00"),
     * matching the format OrderService stores on the order.
     */
    public function current(): string
    {
        return number_format((float) BusinessSetting::getValue('shipping_fee', 200), 2, '.', '');
    }
}
