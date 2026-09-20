<?php

namespace Database\Factories;

use App\Models\Asset;
use App\Models\Category;
use App\Models\HomepageBanner;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HomepageBanner>
 */
class HomepageBannerFactory extends Factory
{
    /**
     * Default: an unpublished banner at display order 0 with no scheduling
     * window (null start/end = always active per architecture.md §4).
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'asset_id' => Asset::factory(),
            'target_category_id' => Category::factory(),
            'display_order' => 0,
            'is_published' => false,
            'start_at' => null,
            'end_at' => null,
        ];
    }

    /**
     * A live banner — the only state the storefront carousel ever shows.
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
