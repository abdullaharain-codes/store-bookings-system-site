<?php

namespace App\Modules\Services\Services;

use App\Models\Service;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use App\Modules\Services\Exceptions\ServiceValidationException;
use App\Shared\AuditLogger;
use App\Shared\Concerns\GeneratesUniqueSlugs;
use Illuminate\Support\Str;

class ServiceService
{
    use GeneratesUniqueSlugs;

    public function __construct(
        private readonly ServiceRepositoryInterface $services,
        private readonly AuditLogger $audit,
    ) {}

    public function createService(array $data): Service
    {
        $attributes = [
            'name' => trim($data['name']),
            'description' => $data['description'] ?? null,
            'price_min' => (float) $data['price_min'],
            'price_max' => (float) $data['price_max'],
            'duration_minutes' => (int) $data['duration_minutes'],
            'is_published' => (bool) ($data['is_published'] ?? false),
        ];

        // Enforced here (PRD §10) rather than as a DB constraint so that a
        // violation surfaces as a clean 422 via ServiceValidationException.
        $this->assertValidPriceRange($attributes['price_min'], $attributes['price_max']);

        $attributes['slug'] = $this->resolveSlug($data['slug'] ?? null, $attributes['name'], excludeId: null);

        $service = $this->services->create($attributes);

        $this->audit->log('Service', $service->id, 'created');

        return $service;
    }

    public function updateService(Service $service, array $data): Service
    {
        $updates = [];

        if (array_key_exists('name', $data)) {
            $updates['name'] = trim($data['name']);
        }

        if (array_key_exists('description', $data)) {
            $updates['description'] = $data['description'];
        }

        if (array_key_exists('duration_minutes', $data)) {
            $updates['duration_minutes'] = (int) $data['duration_minutes'];
        }

        // Publication state changes must go through publish()/unpublish() so
        // every transition is audit-logged; silently accepting is_published
        // here would bypass the audit trail.
        unset($data['is_published']);

        if (array_key_exists('price_min', $data) || array_key_exists('price_max', $data)) {
            // A lone price field is validated against the currently stored
            // counterpart, because partial updates must not silently break the
            // price_min <= price_max invariant.
            $effectivePriceMin = array_key_exists('price_min', $data)
                ? (float) $data['price_min']
                : (float) $service->price_min;
            $effectivePriceMax = array_key_exists('price_max', $data)
                ? (float) $data['price_max']
                : (float) $service->price_max;

            $this->assertValidPriceRange($effectivePriceMin, $effectivePriceMax);

            if (array_key_exists('price_min', $data)) {
                $updates['price_min'] = $effectivePriceMin;
            }
            if (array_key_exists('price_max', $data)) {
                $updates['price_max'] = $effectivePriceMax;
            }
        }

        if (array_key_exists('slug', $data) || array_key_exists('name', $data)) {
            $updates['slug'] = $this->resolveSlug(
                $data['slug'] ?? null,
                $updates['name'] ?? $service->name,
                excludeId: $service->id,
            );
        }

        if ($updates !== []) {
            $this->services->update($service, $updates);

            $this->audit->log('Service', $service->id, 'updated');
        }

        return $service;
    }

    public function publish(Service $service): Service
    {
        if ($service->is_published) {
            return $service;
        }

        $this->services->update($service, ['is_published' => true]);

        $this->audit->log('Service', $service->id, 'published', ['previous' => false]);

        return $service;
    }

    public function unpublish(Service $service): Service
    {
        if (! $service->is_published) {
            return $service;
        }

        $this->services->update($service, ['is_published' => false]);

        $this->audit->log('Service', $service->id, 'unpublished', ['previous' => true]);

        return $service;
    }

    public function deleteService(Service $service): void
    {
        // Audit before deleting so the referenced entity row still exists and
        // the log entry remains meaningful. Same hard-delete semantics as
        // Category/Brand (no SoftDeletes trait on the model).
        $this->audit->log('Service', $service->id, 'deleted');

        $this->services->delete($service);
    }

    /**
     * Explicitly provided slugs are normalized then enforced strictly: an
     * admin-chosen slug that collides is a validation error, not something we
     * silently rename. Auto-generated slugs get -2/-3 suffixing instead.
     */
    private function resolveSlug(?string $providedSlug, string $name, ?int $excludeId): string
    {
        if ($providedSlug !== null && trim($providedSlug) !== '') {
            $slug = Str::slug($providedSlug);

            if ($this->services->slugExists($slug, $excludeId)) {
                throw new ServiceValidationException("The slug \"{$slug}\" is already in use by another service.");
            }

            return $slug;
        }

        return $this->uniqueSlug(
            Str::slug($name),
            fn (string $candidate): bool => $this->services->slugExists($candidate, $excludeId),
        );
    }

    private function assertValidPriceRange(float $priceMin, float $priceMax): void
    {
        if ($priceMin > $priceMax) {
            throw new ServiceValidationException(
                'The price_min must be less than or equal to price_max for a service.'
            );
        }
    }
}
