<?php

namespace App\Modules\ReviewShowcase\Contracts;

use App\Models\ReviewShowcaseItem;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

interface ReviewShowcaseItemRepositoryInterface
{
    public function find(int $id): ?ReviewShowcaseItem;

    /**
     * @param  list<int>  $ids
     * @return Collection<int, ReviewShowcaseItem>
     */
    public function findByIds(array $ids): Collection;

    /**
     * The public carousel feed: only isPublished=true items, in admin-defined
     * display order (deterministic tie-break on id), eager-loading the live
     * asset. Paginated (unlike the hero banner feed — the showcase is a
     * scannable gallery, not a hero carousel).
     */
    public function findPublished(int $perPage = 15): LengthAwarePaginator;

    /**
     * Admin listing with optional filters. Supported keys:
     * 'search' (caption contains), 'status' ('published'|'unpublished'),
     * 'per_page' (int, default 15).
     */
    public function findAllForAdmin(array $filters = []): LengthAwarePaginator;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): ReviewShowcaseItem;

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(ReviewShowcaseItem $item, array $data): ReviewShowcaseItem;

    public function delete(ReviewShowcaseItem $item): void;
}
