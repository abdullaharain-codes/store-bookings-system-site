<?php

namespace App\Modules\ReviewShowcase\Services;

use App\Models\ReviewShowcaseItem;
use App\Modules\ReviewShowcase\Contracts\ReviewShowcaseItemRepositoryInterface;
use App\Modules\ReviewShowcase\Exceptions\ReviewShowcaseValidationException;
use App\Shared\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * Review Showcase business rules (architecture.md §4 — review-showcase domain
 * module).
 *
 * Sibling of BannerService: repository + AuditLogger shape, pinned admin-set
 * publish state (is_published is only ever touched via publish()/unpublish()),
 * and audit actions created/updated/published/unpublished/deleted/reordered
 * on entity 'ReviewShowcaseItem'.
 */
class ReviewShowcaseService
{
    public function __construct(
        private readonly ReviewShowcaseItemRepositoryInterface $items,
        private readonly AuditLogger $audit,
    ) {}

    public function create(array $data): ReviewShowcaseItem
    {
        $attributes = [
            'asset_id' => (int) $data['asset_id'],
            'caption' => $data['caption'] ?? null,
            'display_order' => (int) ($data['display_order'] ?? 0),
            // Always starts unpublished — set explicitly (not just via the DB
            // default) so the in-memory instance matches the write. is_published
            // from the payload is deliberately ignored here: an item goes live
            // only through the explicit publish() action. The task's "dedicated
            // methods only" rule: create/update can never side-step the audited
            // publish path (a stronger stance than BannerService::createBanner's
            // honoring of the flag).
            'is_published' => false,
        ];
        $item = $this->items->create($attributes);
        $this->audit->log('ReviewShowcaseItem', $item->id, 'created');

        return $item;
    }

    /**
     * Only the mutable columns are applied: is_published is deliberately
     * ignored here — flipping it requires the explicit publish()/unpublish()
     * action (mirrors BannerService, so publish state can never be
     * side-stepped by a generic update).
     */
    public function update(ReviewShowcaseItem $item, array $data): ReviewShowcaseItem
    {
        $updates = [];

        foreach (['asset_id', 'caption', 'display_order'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[$field] = $data[$field] ?? null;
            }
        }

        if ($updates !== []) {
            $this->items->update($item, $updates);
            $this->audit->log('ReviewShowcaseItem', $item->id, 'updated');
        }

        return $item;
    }

    public function publish(ReviewShowcaseItem $item): ReviewShowcaseItem
    {
        if ($item->is_published) {
            return $item;
        }

        $this->items->update($item, ['is_published' => true]);
        $this->audit->log('ReviewShowcaseItem', $item->id, 'published', ['previous' => false]);

        return $item;
    }

    public function unpublish(ReviewShowcaseItem $item): ReviewShowcaseItem
    {
        if (! $item->is_published) {
            return $item;
        }

        $this->items->update($item, ['is_published' => false]);
        $this->audit->log('ReviewShowcaseItem', $item->id, 'unpublished', ['previous' => true]);

        return $item;
    }

    public function delete(ReviewShowcaseItem $item): void
    {
        $this->audit->log('ReviewShowcaseItem', $item->id, 'deleted');
        $this->items->delete($item);
    }

    /**
     * Bulk admin reorder (task spec "reorder"): positions 0..n in the given
     * order. Mirrors BannerService::reorderBanners EXACTLY — including the
     * pre-existing partial-ID handling: a list shorter than the full set
     * (or containing an unknown id) is rejected wholesale via the count
     * mismatch, never silently truncated (Phase 12 hardening item #6 documents
     * this behavior as-is; it is mirrored, not redesigned).
     *
     * @param  list<int>  $orderedIds
     */
    public function reorder(array $orderedIds): void
    {
        $items = $this->items->findByIds($orderedIds);

        if (count($items) !== count($orderedIds)) {
            throw new ReviewShowcaseValidationException('Every showcase item in the reorder list must exist.');
        }

        foreach (array_values($orderedIds) as $position => $id) {
            $item = $items->firstWhere('id', $id);

            $this->items->update($item, ['display_order' => $position]);
            $this->audit->log('ReviewShowcaseItem', $id, 'reordered', ['display_order' => $position]);
        }
    }

    public function listPublished(int $perPage = 15): LengthAwarePaginator
    {
        return $this->items->findPublished($perPage);
    }

    public function listAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return $this->items->findAllForAdmin($filters);
    }
}
