<?php

namespace Database\Factories;

use App\Models\Asset;
use App\Models\ReviewShowcaseItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ReviewShowcaseItem>
 */
class ReviewShowcaseItemFactory extends Factory
{
    /**
     * Default: an unpublished item at display order 0. Unpublished by default
     * so tests (and the admin flow) can never accidentally surface a showcase
     * item — only the explicit publish() action takes it live.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'asset_id' => Asset::factory(),
            'caption' => null,
            'display_order' => 0,
            'is_published' => false,
        ];
    }

    /**
     * A live item — the only state the public carousel ever shows.
     */
    public function published(): static
    {
        return $this->state(['is_published' => true]);
    }

    /**
     * Pin the admin-defined carousel position.
     */
    public function ordered(int $displayOrder): static
    {
        return $this->state(['display_order' => $displayOrder]);
    }
}
