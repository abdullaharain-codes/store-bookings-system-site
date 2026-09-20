<?php

namespace App\Modules\Merchandising\Contracts;

use App\Models\HomepageBanner;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

interface BannerRepositoryInterface
{
    public function find(int $id): ?HomepageBanner;

    /**
     * @param  list<int>  $ids
     * @return Collection<int, HomepageBanner>
     */
    public function findByIds(array $ids): Collection;

    /**
     * The storefront carousel feed (design.md §3.7): only isPublished=true
     * banners whose TARGET CATEGORY is also published (a banner pointing at an
     * unpublished category is a dead link on click) — in admin-defined
     * displayOrder. Payload eager-loads the live asset and target category so
     * the frontend resolves `targetCategory.slug` at click time
     * (architecture.md §6).
     *
     * @return Collection<int, HomepageBanner>
     */
    public function findPublished(): Collection;

    /**
     * Admin listing with optional filters. Supported keys:
     * 'search' (target category name contains), 'status' ('published'|'unpublished'),
     * 'per_page' (int, default 15).
     */
    public function findAllForAdmin(array $filters = []): LengthAwarePaginator;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): HomepageBanner;

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(HomepageBanner $banner, array $data): HomepageBanner;

    public function delete(HomepageBanner $banner): void;
}
