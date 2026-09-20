<?php

namespace Database\Factories;

use App\Models\Asset;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Test-only factory for Asset rows (rules.md §6). Exists so relation
 * factories (e.g. ProductImageFactory) can produce valid asset FKs without
 * going through the FileUploadService/storage.
 *
 * @extends Factory<Asset>
 */
class AssetFactory extends Factory
{
    protected $model = Asset::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->slug();

        return [
            'disk' => 'uploads',
            // No physical file is written — tests only exercise DB relations,
            // never the storage layer (that is FileUploadServiceTest's job).
            'path' => "products/{$name}.jpg",
            'thumbnail_path' => "products/thumbs/{$name}.jpg",
            'original_name' => "{$name}.jpg",
            'mime_type' => 'image/jpeg',
            'size' => fake()->numberBetween(50_000, 2_000_000),
            'width' => 1200,
            'height' => 900,
            'alt_text' => fake()->sentence(3),
            'uploaded_by' => null,
        ];
    }
}
