<?php

namespace Database\Factories;

use App\Models\Holiday;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Holiday>
 */
class HolidayFactory extends Factory
{
    /** Realistic shop-closure labels (PRD "Pakistani tech store" domain). */
    private const REASONS = [
        'Eid Holiday',
        'National Day',
        'Annual Maintenance',
        'Public Holiday',
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            // Always a future date — booking only ever blocks upcoming days.
            'date' => fake()->dateTimeBetween('+1 day', '+1 year')->format('Y-m-d'),
            'reason' => fake()->randomElement(self::REASONS),
        ];
    }
}
