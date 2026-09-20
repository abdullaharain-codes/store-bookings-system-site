<?php

namespace App\Modules\Merchandising\Services;

use App\Models\HomepageBanner;
use App\Modules\Merchandising\Contracts\BannerRepositoryInterface;
use App\Modules\Merchandising\Exceptions\BannerValidationException;
use App\Modules\Taxonomy\Services\CategoryService;
use App\Shared\AuditLogger;

/**
 * Homepage Banner business rules (PRD §8).
 *
 * Sibling of CategoryService/BrandService: repository + AuditLogger shape,
 * pinned admin-set publish state (is_published is only ever touched via
 * publish()/unpublish()), and audit actions created/updated/published/
 * unpublished/deleted/reordered.
 *
 * Cross-module read: target-category validation goes through CategoryService
 * (architecture.md §3 — modules touch each OTHER's tables only via service
 * interfaces, never directly).
 */
class BannerService
{
    public function __construct(
        private readonly BannerRepositoryInterface $banners,
        private readonly CategoryService $categories,
        private readonly AuditLogger $audit,
    ) {}

    public function createBanner(array $data): HomepageBanner
    {
        $attributes = [
            'asset_id' => (int) $data['asset_id'],
            'target_category_id' => (int) $data['target_category_id'],
            'display_order' => (int) ($data['display_order'] ?? 0),
            'is_published' => (bool) ($data['is_published'] ?? false),
            'start_at' => $data['start_at'] ?? null,
            'end_at' => $data['end_at'] ?? null,
        ];

        $this->assertTargetCategoryPublished($attributes['target_category_id']);

        $banner = $this->banners->create($attributes);
        $this->audit->log('HomepageBanner', $banner->id, 'created');

        return $banner;
    }

    /**
     * Only the mutable columns are applied: is_published is deliberately
     * ignored here — flipping it requires the explicit publish()/unpublish()
     * action (mirrors CategoryService, so publish state can never be
     * side-stepped by a generic update).
     */
    public function updateBanner(HomepageBanner $banner, array $data): HomepageBanner
    {
        $updates = [];

        foreach (['asset_id', 'display_order', 'start_at', 'end_at'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[$field] = $data[$field] ?? null;
            }
        }

        if (array_key_exists('target_category_id', $data)) {
            $targetId = (int) $data['target_category_id'];
            if ($targetId !== (int) $banner->target_category_id) {
                $this->assertTargetCategoryPublished($targetId);
                $updates['target_category_id'] = $targetId;
            }
        }

        if ($updates !== []) {
            $this->banners->update($banner, $updates);
            $this->audit->log('HomepageBanner', $banner->id, 'updated');
        }

        return $banner;
    }

    public function publish(HomepageBanner $banner): HomepageBanner
    {
        // Re-validated even when already published: a banner whose target
        // category was unpublished since it went live must not be (re)affirmed.
        $this->assertTargetCategoryPublished((int) $banner->target_category_id);

        if ($banner->is_published) {
            return $banner;
        }

        $this->banners->update($banner, ['is_published' => true]);
        $this->audit->log('HomepageBanner', $banner->id, 'published', ['previous' => false]);

        return $banner;
    }

    public function unpublish(HomepageBanner $banner): HomepageBanner
    {
        if (! $banner->is_published) {
            return $banner;
        }

        $this->banners->update($banner, ['is_published' => false]);
        $this->audit->log('HomepageBanner', $banner->id, 'unpublished', ['previous' => true]);

        return $banner;
    }

    public function deleteBanner(HomepageBanner $banner): void
    {
        $this->audit->log('HomepageBanner', $banner->id, 'deleted');
        $this->banners->delete($banner);
    }

    /**
     * Bulk admin reorder (PRD §8 "reorder"): positions 0..n in the given order.
     *
     * @param  list<int>  $orderedIds
     */
    public function reorderBanners(array $orderedIds): void
    {
        $banners = $this->banners->findByIds($orderedIds);

        if (count($banners) !== count($orderedIds)) {
            throw new BannerValidationException('Every banner in the reorder list must exist.');
        }

        foreach (array_values($orderedIds) as $position => $id) {
            $banner = $banners->firstWhere('id', $id);

            $this->banners->update($banner, ['display_order' => $position]);
            $this->audit->log('HomepageBanner', $id, 'reordered', ['display_order' => $position]);
        }
    }

    /**
     * The banner's whole purpose (PRD §8) is a click that lands the shopper on
     * a real category listing. A missing or unpublished target is a broken
     * destination, so it is rejected at create/update AND re-checked on publish.
     */
    private function assertTargetCategoryPublished(int $categoryId): void
    {
        $category = $this->categories->findCategory($categoryId);

        if (! $category || ! $category->is_published) {
            throw new BannerValidationException('A banner must target a published category.');
        }
    }
}
