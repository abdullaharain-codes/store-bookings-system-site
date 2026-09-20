<?php

namespace App\Modules\Taxonomy\Contracts;

use App\Models\Brand;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

interface BrandRepositoryInterface
{
    public function find(int $id): ?Brand;

    public function findBySlug(string $slug): ?Brand;

    /**
     * Published brands, ordered alphabetically.
     *
     * @return Collection<int, Brand>
     */
    public function findPublished(): Collection;

    /**
     * Admin listing with optional filters.
     * Supported keys: 'search' (name/slug contains), 'status' ('published'|'unpublished'),
     * 'per_page' (int, default 15).
     */
    public function findAllForAdmin(array $filters = []): LengthAwarePaginator;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Brand;

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Brand $brand, array $data): Brand;

    public function delete(Brand $brand): void;

    public function slugExists(string $slug, ?int $excludeId = null): bool;
}
