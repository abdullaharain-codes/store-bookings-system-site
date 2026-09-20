<?php

namespace Database\Factories;

use App\Models\Order;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Order>
 */
class OrderFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'order_number' => 'ORD-'.date('Y').'-'.strtoupper(fake()->bothify('????????????')),
            'user_id' => User::factory(),
            'recipient_name' => fake()->name(),
            'phone' => fake()->numerify('03##-#######'),
            'address_line_1' => fake()->address(),
            'city' => fake()->city(),
            'subtotal' => number_format(fake()->randomFloat(2, 100, 5000), 2, '.', ''),
            'shipping_fee' => '200.00',
            'total' => number_format(fake()->randomFloat(2, 300, 5200), 2, '.', ''),
            'status' => 'pending',
            'payment_status' => 'pending',
        ];
    }
}
