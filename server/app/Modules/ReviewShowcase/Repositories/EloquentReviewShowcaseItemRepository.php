<?php

namespace App\Modules\ReviewShowcase\Repositories;

use App\Models\ReviewShowcaseItem;
use App\Modules\ReviewShowcase\Contracts\ReviewShowcaseItemRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class EloquentReviewShowcaseItemRepository implements ReviewShowcaseItemRepositoryInterface
{
    public function find(int $id): ?ReviewShowcaseItem
    {
        return ReviewShowcaseItem::query()->find($id);
    }

    public function findByIds(array $ids): Collection
    {
        return ReviewShowcaseItem::query()->whereIn('id', $ids)->get();
    }

    public function findPublished(int $perPage = 15): LengthAwarePaginator
    {
        return ReviewShowcaseItem::query()
            ->where('is_published', true)
            ->with('asset')
            ->orderBy('display_order')
            ->orderBy('id')
            ->paginate($perPage);
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return ReviewShowcaseItem::query()
            ->with('asset')
            ->when(
                $filters['search'] ?? null,
                fn ($query, string $search) => $query->where('caption', 'like', "%{$search}%")
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
            ->orderBy('id')
            ->paginate((int) ($filters['per_page'] ?? 15));
    }

    public function create(array $data): ReviewShowcaseItem
    {
        return ReviewShowcaseItem::query()->create($data);
    }

    public function update(ReviewShowcaseItem $item, array $data): ReviewShowcaseItem
    {
        $item->fill($data)->save();

        return $item;
    }

    public function delete(ReviewShowcaseItem $item): void
    {
        $item->delete();
    }
}
