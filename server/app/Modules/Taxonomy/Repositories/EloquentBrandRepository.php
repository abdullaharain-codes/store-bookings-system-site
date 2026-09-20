<?php

namespace App\Modules\Taxonomy\Repositories;

use App\Models\Brand;
use App\Modules\Taxonomy\Contracts\BrandRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class EloquentBrandRepository implements BrandRepositoryInterface
{
    public function find(int $id): ?Brand
    {
        return Brand::query()->find($id);
    }

    public function findBySlug(string $slug): ?Brand
    {
        return Brand::query()->where('slug', $slug)->first();
    }

    public function findPublished(): Collection
    {
        return Brand::query()
            ->where('is_published', true)
            ->orderBy('name')
            ->get();
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return Brand::query()
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

    public function create(array $data): Brand
    {
        return Brand::query()->create($data);
    }

    public function update(Brand $brand, array $data): Brand
    {
        $brand->fill($data)->save();

        return $brand;
    }

    public function delete(Brand $brand): void
    {
        $brand->delete();
    }

    public function slugExists(string $slug, ?int $excludeId = null): bool
    {
        return Brand::query()
            ->where('slug', $slug)
            ->when($excludeId !== null, fn ($query) => $query->where('id', '!=', $excludeId))
            ->exists();
    }
}
