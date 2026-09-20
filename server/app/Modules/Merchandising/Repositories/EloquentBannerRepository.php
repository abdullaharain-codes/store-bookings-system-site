<?php

namespace App\Modules\Merchandising\Repositories;

use App\Models\HomepageBanner;
use App\Modules\Merchandising\Contracts\BannerRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class EloquentBannerRepository implements BannerRepositoryInterface
{
    public function find(int $id): ?HomepageBanner
    {
        return HomepageBanner::query()->find($id);
    }

    public function findByIds(array $ids): Collection
    {
        return HomepageBanner::query()->whereIn('id', $ids)->get();
    }

    public function findPublished(): Collection
    {
        return HomepageBanner::query()
            ->where('is_published', true)
            // A banner whose target category was unpublished after the banner
            // went live is a dead link on click — never surfaced (architecture.md §6).
            ->whereHas('targetCategory', fn ($query) => $query->where('is_published', true))
            ->with(['asset', 'targetCategory'])
            ->orderBy('display_order')
            ->get();
    }

    public function findAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return HomepageBanner::query()
            ->with(['asset', 'targetCategory'])
            ->when(
                $filters['search'] ?? null,
                fn ($query, string $search) => $query->whereHas(
                    'targetCategory',
                    fn ($query) => $query->where('name', 'like', "%{$search}%")
                )
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

    public function create(array $data): HomepageBanner
    {
        return HomepageBanner::query()->create($data);
    }

    public function update(HomepageBanner $banner, array $data): HomepageBanner
    {
        $banner->fill($data)->save();

        return $banner;
    }

    public function delete(HomepageBanner $banner): void
    {
        $banner->delete();
    }
}
