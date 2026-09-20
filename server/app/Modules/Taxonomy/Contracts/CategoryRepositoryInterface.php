<?php

namespace App\Modules\Taxonomy\Contracts;

use App\Models\Category;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

interface CategoryRepositoryInterface
{
    public function find(int $id): ?Category;

    /**
     * Batch lookup in a single whereIn query (N+1 avoidance for cross-module
     * existence checks, rules.md §10).
     *
     * @param  list<int>  $ids
     * @return Collection<int, Category>
     */
    public function findByIds(array $ids): Collection;

    public function findBySlug(string $slug): ?Category;

    /**
     * Published categories ordered by display order.
     * When $parentId is provided, only direct children of that parent are returned.
     *
     * @return Collection<int, Category>
     */
    public function findPublished(?int $parentId = null): Collection;

    /**
     * Admin listing with optional filters.
     * Supported keys: 'search' (name/slug contains), 'status' ('published'|'unpublished'),
     * 'per_page' (int, default 15).
     */
    public function findAllForAdmin(array $filters = []): LengthAwarePaginator;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Category;

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Category $category, array $data): Category;

    public function delete(Category $category): void;

    public function slugExists(string $slug, ?int $excludeId = null): bool;

    /**
     * The category itself plus every descendant ID (breadth-first, any depth).
     * Backs CategoryService::getProductScope() per architecture.md §4.
     *
     * @return list<int>
     */
    public function getDescendantIds(int $categoryId): array;
}
