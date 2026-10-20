<?php

namespace Database\Factories;

use App\Models\Brand;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = ucwords(fake()->unique()->words(3, true));
        $slug = Str::slug($name);

        return [
            'name' => $name,
            'slug' => $slug,
            // SKU derived from the unique slug so both stay unique together.
            'sku' => 'SKU-'.strtoupper(Str::substr(md5($slug), 0, 10)),
            'description' => fake()->sentence(12),
            'price' => fake()->randomFloat(2, 500, 250000),
            'stock_quantity' => fake()->numberBetween(0, 100),
            'brand_id' => null,
            'is_published' => false,
            // Merchandising flag (BE2): products are not featured by default.
            'is_featured' => false,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => ['is_published' => true]);
    }

    /**
     * Admin-set merchandising flag (BE2). Independent of published(), because
     * "is this featured" and "is this live" are separate questions — a draft can
     * be featured, and it is the public filter that then hides it.
     */
    public function featured(): static
    {
        return $this->state(fn () => ['is_featured' => true]);
    }

    public function forBrand(Brand $brand): static
    {
        return $this->state(fn () => ['brand_id' => $brand->id]);
    }
}
