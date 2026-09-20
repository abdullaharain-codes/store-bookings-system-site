<?php

namespace App\Modules\Services\Repositories;

use App\Models\Service;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class EloquentServiceRepository implements ServiceRepositoryInterface
{
    public function find(int $id): ?Service
    {
        return Service::query()->find($id);
    }

    public function findBySlug(string $slug): ?Service
    {
        return Service::query()->where('slug', $slug)->first();
    }

    public function findPublished(int $perPage = 15): LengthAwarePaginator
    {
        return Service::query()
            ->where('is_published', true)
            ->orderBy('name')
            ->paginate($perPage);
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return Service::query()
            ->when(
                $filters['search'] ?? null,
                fn ($query, string $search) => $query->where(function ($query) use ($search) {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('slug', 'like', "%{$search}%");
                })
            )
            ->when(
                ($filters['status'] ?? null) === 'published',
                fn ($query) => $query->where('is_published', true)
            )
            ->when(
                ($filters['status'] ?? null) === 'unpublished',
                fn ($query) => $query->where('is_published', false)
            )
            ->orderBy('name')
            ->paginate((int) ($filters['per_page'] ?? 15));
    }

    public function create(array $data): Service
    {
        return Service::query()->create($data);
    }

    public function update(Service $service, array $data): Service
    {
        $service->fill($data)->save();

        return $service;
    }

    public function delete(Service $service): void
    {
        $service->delete();
    }

    public function slugExists(string $slug, ?int $excludeId = null): bool
    {
        return Service::query()
            ->where('slug', $slug)
            ->when($excludeId !== null, fn ($query) => $query->where('id', '!=', $excludeId))
            ->exists();
    }
}
