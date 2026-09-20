<?php

namespace App\Modules\Taxonomy\Services;

use App\Models\Brand;
use App\Modules\Taxonomy\Contracts\BrandRepositoryInterface;
use App\Modules\Taxonomy\Exceptions\BrandValidationException;
use App\Shared\AuditLogger;
use App\Shared\Concerns\GeneratesUniqueSlugs;
use Illuminate\Support\Str;

class BrandService
{
    use GeneratesUniqueSlugs;

    public function __construct(
        private readonly BrandRepositoryInterface $brands,
        private readonly AuditLogger $audit,
    ) {}

    public function createBrand(array $data): Brand
    {
        $attributes = [
            'name' => trim($data['name']),
            'logo_asset_id' => isset($data['logo_asset_id']) ? (int) $data['logo_asset_id'] : null,
            'is_published' => (bool) ($data['is_published'] ?? false),
        ];

        $attributes['slug'] = $this->resolveSlug($data['slug'] ?? null, $attributes['name'], excludeId: null);

        $brand = $this->brands->create($attributes);

        $this->audit->log('Brand', $brand->id, 'created');

        return $brand;
    }

    public function updateBrand(Brand $brand, array $data): Brand
    {
        $updates = [];

        if (array_key_exists('name', $data)) {
            $updates['name'] = trim($data['name']);
        }

        if (array_key_exists('logo_asset_id', $data)) {
            $updates['logo_asset_id'] = isset($data['logo_asset_id']) ? (int) $data['logo_asset_id'] : null;
        }

        // Publication state changes must go through publish()/unpublish() so
        // every transition is audit-logged.
        unset($data['is_published']);

        if (array_key_exists('slug', $data) || array_key_exists('name', $data)) {
            $updates['slug'] = $this->resolveSlug(
                $data['slug'] ?? null,
                $updates['name'] ?? $brand->name,
                excludeId: $brand->id,
            );
        }

        if ($updates !== []) {
            $this->brands->update($brand, $updates);

            $this->audit->log('Brand', $brand->id, 'updated');
        }

        return $brand;
    }

    public function publish(Brand $brand): Brand
    {
        if ($brand->is_published) {
            return $brand;
        }

        $this->brands->update($brand, ['is_published' => true]);

        $this->audit->log('Brand', $brand->id, 'published', ['previous' => false]);

        return $brand;
    }

    public function unpublish(Brand $brand): Brand
    {
        if (! $brand->is_published) {
            return $brand;
        }

        $this->brands->update($brand, ['is_published' => false]);

        $this->audit->log('Brand', $brand->id, 'unpublished', ['previous' => true]);

        return $brand;
    }

    public function deleteBrand(Brand $brand): void
    {
        // Audit before deleting so the referenced entity row still exists.
        $this->audit->log('Brand', $brand->id, 'deleted');

        $this->brands->delete($brand);
    }

    private function resolveSlug(?string $providedSlug, string $name, ?int $excludeId): string
    {
        if ($providedSlug !== null && trim($providedSlug) !== '') {
            $slug = Str::slug($providedSlug);

            if ($this->brands->slugExists($slug, $excludeId)) {
                throw new BrandValidationException("The slug \"{$slug}\" is already in use by another brand.");
            }

            return $slug;
        }

        return $this->uniqueSlug(
            Str::slug($name),
            fn (string $candidate): bool => $this->brands->slugExists($candidate, $excludeId),
        );
    }
}
