<?php

namespace App\Modules\Taxonomy\Repositories;

use App\Models\Category;
use App\Modules\Taxonomy\Contracts\CategoryRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class EloquentCategoryRepository implements CategoryRepositoryInterface
{
    public function find(int $id): ?Category
    {
        return Category::query()->find($id);
    }

    public function findByIds(array $ids): Collection
    {
        return Category::query()->whereIn('id', $ids)->get();
    }

    public function findBySlug(string $slug): ?Category
    {
        return Category::query()
            ->with(['logoAsset', 'bannerAsset'])
            ->where('slug', $slug)
            ->first();
    }

    public function findPublished(?int $parentId = null): Collection
    {
        return Category::query()
            ->with(['logoAsset', 'bannerAsset'])
            ->where('is_published', true)
            ->when($parentId !== null, fn ($query) => $query->where('parent_category_id', $parentId))
            ->orderBy('display_order')
            ->orderBy('name')
            ->get();
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return Category::query()
            ->with(['logoAsset', 'bannerAsset'])
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
            ->orderBy('display_order')
            ->orderBy('name')
            ->paginate((int) ($filters['per_page'] ?? 15));
    }

    public function create(array $data): Category
    {
        return Category::query()->create($data);
    }

    public function update(Category $category, array $data): Category
    {
        $category->fill($data)->save();

        return $category;
    }

    public function delete(Category $category): void
    {
        $category->delete();
    }

    public function slugExists(string $slug, ?int $excludeId = null): bool
    {
        return Category::query()
            ->where('slug', $slug)
            ->when($excludeId !== null, fn ($query) => $query->where('id', '!=', $excludeId))
            ->exists();
    }

    public function getDescendantIds(int $categoryId): array
    {
        // Iterative breadth-first walk over the parent/child map. Cycle-safe:
        // already-visited nodes are skipped, so corrupt data cannot loop forever.
        $childrenByParent = Category::query()
            ->get(['id', 'parent_category_id'])
            ->groupBy('parent_category_id');

        $result = [];
        $visited = [];
        $queue = [$categoryId];

        while (($current = array_shift($queue)) !== null) {
            if (isset($visited[$current])) {
                continue;
            }
            $visited[$current] = true;
            $result[] = (int) $current;

            foreach ($childrenByParent->get($current, collect()) as $child) {
                $queue[] = (int) $child->id;
            }
        }

        return $result;
    }
}
