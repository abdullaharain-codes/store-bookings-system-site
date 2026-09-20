<?php

namespace Database\Factories;

use App\Models\BusinessHour;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BusinessHour>
 */
class BusinessHourFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * Realistic default: a random Monday–Friday weekday, open 09:00–18:00.
     * (Mon–Sat with Sunday closed is built by combining states per test.)
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // 1..5 = Monday..Friday (day_of_week convention: 0 = Sunday).
            'day_of_week' => fake()->numberBetween(1, 5),
            'opens_at' => '09:00:00',
            'closes_at' => '18:00:00',
            'is_closed' => false,
        ];
    }

    /**
     * Mark the day as explicitly closed: no open interval at all.
     */
    public function closed(): static
    {
        return $this->state([
            'opens_at' => null,
            'closes_at' => null,
            'is_closed' => true,
        ]);
    }

    /**
     * Set a specific open interval (times as 'H:i' or 'H:i:s').
     */
    public function hours(string $open, string $close): static
    {
        return $this->state([
            'opens_at' => $open,
            'closes_at' => $close,
            'is_closed' => false,
        ]);
    }
}
