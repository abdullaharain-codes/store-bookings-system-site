<?php

use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\ReviewShowcaseItem;
use App\Models\User;
use App\Modules\ReviewShowcase\Exceptions\ReviewShowcaseValidationException;
use App\Modules\ReviewShowcase\Services\ReviewShowcaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(ReviewShowcaseService::class);
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

function showcaseServicePayload(): array
{
    return [
        'asset_id' => Asset::factory()->create()->id,
    ];
}

// ─── Creation ─────────────────────────────────────────────────────────────────

test('create builds an unpublished item at order 0 with no caption', function () {
    $item = $this->service->create(showcaseServicePayload());

    expect($item->is_published)->toBeFalse();
    expect($item->display_order)->toBe(0);
    expect($item->caption)->toBeNull();

    expect(AuditLog::where([
        ['entity', 'ReviewShowcaseItem'],
        ['entity_id', $item->id],
        ['action', 'created'],
        ['actor_id', $this->user->id],
    ])->exists())->toBeTrue();
});

test('create honors explicit order and caption', function () {
    $item = $this->service->create([
        ...showcaseServicePayload(),
        'caption' => 'Five stars and a smile',
        'display_order' => 4,
    ]);

    expect($item->display_order)->toBe(4);
    expect($item->caption)->toBe('Five stars and a smile');
});

test('create ignores is_published — an item always starts unpublished', function () {
    $item = $this->service->create([
        ...showcaseServicePayload(),
        'is_published' => true,
    ]);

    expect($item->refresh()->is_published)->toBeFalse();
});

// ─── Update ───────────────────────────────────────────────────────────────────

test('update leaves publish state alone', function () {
    $item = $this->service->create(showcaseServicePayload());
    $newAssetId = Asset::factory()->create()->id;

    $this->service->update($item, [
        'asset_id' => $newAssetId,
        'caption' => 'Updated caption',
        'display_order' => 7,
    ]);

    expect($item->refresh()->asset_id)->toBe($newAssetId);
    expect($item->caption)->toBe('Updated caption');
    expect($item->display_order)->toBe(7);
    expect($item->is_published)->toBeFalse();

    expect(AuditLog::where([
        ['entity', 'ReviewShowcaseItem'],
        ['entity_id', $item->id],
        ['action', 'updated'],
        ['actor_id', $this->user->id],
    ])->exists())->toBeTrue();
});

test('update ignores is_published tampering (publish/unpublish own that state)', function () {
    $item = $this->service->create(showcaseServicePayload());

    $this->service->update($item, ['is_published' => true]);

    expect($item->refresh()->is_published)->toBeFalse();
    expect(AuditLog::where('entity_id', $item->id)->count())->toBe(1); // created only
});

// ─── Publication ──────────────────────────────────────────────────────────────

test('publish and unpublish write audit rows with actor and previous state', function () {
    $item = $this->service->create(showcaseServicePayload());

    $this->service->publish($item);

    $publishedLog = AuditLog::query()
        ->where('entity', 'ReviewShowcaseItem')
        ->where('action', 'published')
        ->firstOrFail();
    expect($publishedLog->entity_id)->toBe($item->id);
    expect($publishedLog->actor_id)->toBe($this->user->id);
    expect($publishedLog->metadata)->toBe(['previous' => false]);

    $this->service->unpublish($item);

    $unpublishedLog = AuditLog::query()
        ->where('entity', 'ReviewShowcaseItem')
        ->where('action', 'unpublished')
        ->firstOrFail();
    expect($unpublishedLog->metadata)->toBe(['previous' => true]);
    expect($item->refresh()->is_published)->toBeFalse();
});

test('repeated publish is an idempotent no-op (single audit row)', function () {
    $item = $this->service->create(showcaseServicePayload());

    $this->service->publish($item);
    $this->service->publish($item);

    expect(AuditLog::query()->where('entity', 'ReviewShowcaseItem')->where('action', 'published')->count())->toBe(1);
    expect($item->refresh()->is_published)->toBeTrue();
});

// ─── Reorder ─────────────────────────────────────────────────────────────────

test('reorder assigns positions 0..n and audits each item', function () {
    $a = $this->service->create(showcaseServicePayload());
    $b = $this->service->create(showcaseServicePayload());
    $c = $this->service->create(showcaseServicePayload());

    $this->service->reorder([$c->id, $b->id, $a->id]);

    expect($a->refresh()->display_order)->toBe(2);
    expect($b->refresh()->display_order)->toBe(1);
    expect($c->refresh()->display_order)->toBe(0);

    expect(AuditLog::query()->where('entity', 'ReviewShowcaseItem')->where('action', 'reordered')->count())->toBe(3);
    $reorderedC = AuditLog::query()
        ->where('entity', 'ReviewShowcaseItem')->where('action', 'reordered')
        ->where('entity_id', $c->id)->firstOrFail();
    expect($reorderedC->metadata)->toBe(['display_order' => 0]);
});

test('reorder rejects a list containing a missing id', function () {
    $a = $this->service->create(showcaseServicePayload());

    expect(fn () => $this->service->reorder([$a->id, 99999]))
        ->toThrow(ReviewShowcaseValidationException::class, 'Every showcase item in the reorder list must exist.');
});

test('reorder on a partial id list mirrors banners exactly (collision edge preserved)', function () {
    // Phase 12 hardening #6 pre-existing behavior, mirrored faithfully and NOT
    // silently fixed: a subset of existing ids reorders those items to
    // positions 0..n and leaves the omitted item on its stale position — the
    // omitted item can end up colliding (here b and c both sit at 0). Banners
    // behave identically.
    $a = $this->service->create(showcaseServicePayload());
    $b = $this->service->create(showcaseServicePayload());
    $c = $this->service->create(showcaseServicePayload());

    $this->service->reorder([$b->id, $a->id]);

    expect($b->refresh()->display_order)->toBe(0);
    expect($a->refresh()->display_order)->toBe(1);
    expect($c->refresh()->display_order)->toBe(0);

    expect(AuditLog::query()->where('entity', 'ReviewShowcaseItem')->where('action', 'reordered')->count())->toBe(2);
});

// ─── Delete ──────────────────────────────────────────────────────────────────

test('delete writes the audit entry before removing the item', function () {
    $item = $this->service->create(showcaseServicePayload());

    $this->service->delete($item);

    $deletedLog = AuditLog::query()
        ->where('entity', 'ReviewShowcaseItem')
        ->where('action', 'deleted')
        ->firstOrFail();
    expect((int) $deletedLog->entity_id)->toBe($item->id);
    expect($deletedLog->actor_id)->toBe($this->user->id);

    expect(ReviewShowcaseItem::query()->find($item->id))->toBeNull();
});

// ─── Reads ───────────────────────────────────────────────────────────────────

test('listPublished returns only published items in display order', function () {
    ReviewShowcaseItem::factory()->ordered(2)->published()->create();
    ReviewShowcaseItem::factory()->ordered(0)->published()->create();
    $draft = ReviewShowcaseItem::factory()->ordered(1)->create();
    ReviewShowcaseItem::factory()->ordered(3)->published()->create();

    $page = $this->service->listPublished();

    expect($page->total())->toBe(3);
    expect($page->pluck('display_order')->all())->toBe([0, 2, 3]);
    expect($page->pluck('id'))->not->toContain($draft->id);
});

test('listAllForAdmin includes unpublished items and filters by search and status', function () {
    ReviewShowcaseItem::factory()->published()->create(['caption' => 'Love the new laptop']);
    ReviewShowcaseItem::factory()->create(['caption' => 'The technician was great']);
    ReviewShowcaseItem::factory()->create(['caption' => null]);

    expect($this->service->listAllForAdmin()->total())->toBe(3);
    expect($this->service->listAllForAdmin(['status' => 'published'])->total())->toBe(1);
    expect($this->service->listAllForAdmin(['status' => 'unpublished'])->total())->toBe(2);
    expect($this->service->listAllForAdmin(['search' => 'technician'])->total())->toBe(1);
});
