<?php

namespace Database\Factories;

use App\Models\Address;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Address>
 */
class AddressFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'label' => fake()->randomElement(['Home', 'Office', null]),
            'recipient_name' => fake()->name(),
            'phone' => fake()->numerify('03##-#######'),
            'address_line_1' => fake()->address(),
            'address_line_2' => fake()->optional()->secondaryAddress(),
            'city' => fake()->city(),
            'postal_code' => fake()->optional()->numerify('#####'),
            'map_link' => 'https://maps.app.goo.gl/'.fake()->regexify('[A-Za-z0-9]{10}'),
            'is_default' => false,
        ];
    }
}
