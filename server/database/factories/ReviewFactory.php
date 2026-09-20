<?php

namespace Database\Factories;

use App\Models\Product;
use App\Models\Review;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Review>
 */
class ReviewFactory extends Factory
{
    /**
     * Default: a live, published PRODUCT review (verified by a delivered
     * order). Service reviews are built with the forService() state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'product_id' => Product::factory()->published(),
            'service_id' => null,
            'rating' => fake()->numberBetween(1, 5),
            'comment' => fake()->paragraph(2),
            'verified_source' => 'order',
            'source_id' => fake()->randomNumber(5),
            'is_published' => true,
        ];
    }

    /**
     * Pin the reviewed product and the delivering order that granted access.
     */
    public function forProduct(Product $product, int $sourceOrderId): static
    {
        return $this->state([
            'product_id' => $product->id,
            'service_id' => null,
            'verified_source' => 'order',
            'source_id' => $sourceOrderId,
        ]);
    }

    /**
     * Pin the reviewed service and the completed booking that granted access.
     */
    public function forService(Service $service, int $sourceBookingId): static
    {
        return $this->state([
            'product_id' => null,
            'service_id' => $service->id,
            'verified_source' => 'service_booking',
            'source_id' => $sourceBookingId,
        ]);
    }

    /**
     * A review the admins have hidden from the public lists.
     */
    public function unpublished(): static
    {
        return $this->state(['is_published' => false]);
    }

    /**
     * Pin the exact star rating (useful for byte-identical list assertions).
     */
    public function rated(int $rating): static
    {
        return $this->state(['rating' => $rating]);
    }
}
