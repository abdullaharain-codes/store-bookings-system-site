<?php

namespace Database\Factories;

use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Service>
 */
class ServiceFactory extends Factory
{
    /** Realistic doorstep-IT service names (PRD "Pakistani tech store" domain). */
    private const SERVICE_NAMES = [
        'Laptop Screen Repair',
        'PC Deep Cleaning',
        'Motherboard Diagnostics',
        'Windows Installation',
        'Virus & Malware Removal',
        'Data Recovery',
        'Thermal Paste Replacement',
        'SSD Upgrade',
        'Printer Setup & Repair',
        'Home Network Setup',
        'Keyboard Replacement',
        'Battery Replacement',
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Deliberately NOT fake()->unique(): the curated pool is finite, and
        // unique() would throw an exhausted-uniqueness exception once every
        // name has been used once (e.g. Service::factory()->count(13+)->create()).
        // Duplicate 'name' values are fine — only 'slug' is DB-unique, and the
        // random suffix below guarantees that instead.
        $name = fake()->randomElement(self::SERVICE_NAMES);
        $slug = Str::slug($name).'-'.Str::lower(Str::random(6));

        // price_min is strictly below price_max so every factory row satisfies
        // the Service business rule by construction.
        $priceMin = fake()->numberBetween(1000, 15000);
        $priceMax = fake()->numberBetween($priceMin + 1, 50000);

        return [
            'name' => $name,
            'slug' => $slug,
            'description' => fake()->sentence(10),
            'price_min' => $priceMin,
            'price_max' => $priceMax,
            'duration_minutes' => fake()->numberBetween(30, 240),
            'is_published' => fake()->boolean(),
        ];
    }
}
