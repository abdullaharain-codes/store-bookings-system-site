<?php

use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\HomepageBanner;
use App\Models\User;
use App\Modules\Merchandising\Exceptions\BannerValidationException;
use App\Modules\Merchandising\Services\BannerService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(BannerService::class);
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

function serviceCategory(): Category
{
    return Category::factory()->create(['is_published' => true]);
}

function servicePayload(int $categoryId): array
{
    return [
        'asset_id' => Asset::factory()->create()->id,
        'target_category_id' => $categoryId,
    ];
}

// ─── Creation ─────────────────────────────────────────────────────────────────

test('createBanner builds an unpublished banner at order 0 with no window', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    expect($banner->is_published)->toBeFalse();
    expect($banner->display_order)->toBe(0);
    expect($banner->start_at)->toBeNull();
    expect($banner->end_at)->toBeNull();

    expect(AuditLog::where([
        ['entity', 'HomepageBanner'],
        ['entity_id', $banner->id],
        ['action', 'created'],
        ['actor_id', $this->user->id],
    ])->exists())->toBeTrue();
});

test('createBanner honors explicit order, publish flag and scheduling window', function () {
    $banner = $this->service->createBanner([
        ...servicePayload(serviceCategory()->id),
        'display_order' => 4,
        'is_published' => true,
        'start_at' => '2026-09-01 08:00:00',
        'end_at' => '2026-10-01 08:00:00',
    ]);

    expect($banner->display_order)->toBe(4);
    expect($banner->is_published)->toBeTrue();
    expect($banner->start_at)->not->toBeNull();
    expect($banner->end_at)->not->toBeNull();
});

test('createBanner rejects a banner targeting an unpublished category', function () {
    $category = Category::factory()->create(['is_published' => false]);

    expect(fn () => $this->service->createBanner(servicePayload($category->id)))
        ->toThrow(BannerValidationException::class, 'A banner must target a published category.');
});

test('createBanner rejects a banner targeting a missing category', function () {
    expect(fn () => $this->service->createBanner(servicePayload(99999)))
        ->toThrow(BannerValidationException::class, 'A banner must target a published category.');
});

// ─── Update ───────────────────────────────────────────────────────────────────

test('updateBanner re-points the destination and leaves publish state alone', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));
    $targetB = serviceCategory();

    $this->service->updateBanner($banner, [
        'target_category_id' => $targetB->id,
        'display_order' => 7,
    ]);

    expect($banner->refresh()->target_category_id)->toBe($targetB->id);
    expect($banner->display_order)->toBe(7);
    expect($banner->is_published)->toBeFalse();

    expect(AuditLog::where([
        ['entity', 'HomepageBanner'],
        ['entity_id', $banner->id],
        ['action', 'updated'],
        ['actor_id', $this->user->id],
    ])->exists())->toBeTrue();
});

test('updateBanner ignores is_published tampering (publish/unpublish own that state)', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    $this->service->updateBanner($banner, ['is_published' => true]);

    expect($banner->refresh()->is_published)->toBeFalse();
    expect(AuditLog::where('entity_id', $banner->id)->count())->toBe(1); // created only
});

test('updateBanner rejects moving a banner onto an unpublished target', function () {
    $hiddenTarget = Category::factory()->create(['is_published' => false]);
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    expect(fn () => $this->service->updateBanner($banner, [
        'target_category_id' => $hiddenTarget->id,
    ]))->toThrow(BannerValidationException::class);
});

test('updateBanner keeps its target untouched when sent the same one', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    $this->service->updateBanner($banner, ['target_category_id' => $banner->target_category_id]);

    expect(AuditLog::where('entity_id', $banner->id)->where('action', 'updated')->count())->toBe(0);
});

// ─── Publication ──────────────────────────────────────────────────────────────

test('publish and unpublish write audit rows with actor and previous state', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    $this->service->publish($banner);

    $publishedLog = AuditLog::query()
        ->where('entity', 'HomepageBanner')
        ->where('action', 'published')
        ->firstOrFail();
    expect($publishedLog->entity_id)->toBe($banner->id);
    expect($publishedLog->actor_id)->toBe($this->user->id);
    expect($publishedLog->metadata)->toBe(['previous' => false]);

    $this->service->unpublish($banner);

    $unpublishedLog = AuditLog::query()
        ->where('entity', 'HomepageBanner')
        ->where('action', 'unpublished')
        ->firstOrFail();
    expect($unpublishedLog->entity_id)->toBe($banner->id);
    expect($unpublishedLog->metadata)->toBe(['previous' => true]);
    expect($banner->refresh()->is_published)->toBeFalse();
});

test('repeated publish is an idempotent no-op (single audit row)', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    $this->service->publish($banner);
    $this->service->publish($banner);

    expect(AuditLog::query()->where('action', 'published')->count())->toBe(1);
    expect($banner->refresh()->is_published)->toBeTrue();
});

test('publish re-validates the target so it cannot re-affirm a dead link', function () {
    // A banner goes live, THEN its destination category is unpublished (only
    // possible at the DB layer — Taxonomy's own rules govern categories).
    $category = serviceCategory();
    $banner = $this->service->createBanner(servicePayload($category->id));
    $this->service->publish($banner);

    $category->update(['is_published' => false]);

    expect(fn () => $this->service->publish($banner))
        ->toThrow(BannerValidationException::class, 'A banner must target a published category.');
});

// ─── Reorder ─────────────────────────────────────────────────────────────────

test('reorderBanners assigns positions 0..n and audits each banner', function () {
    $a = $this->service->createBanner(servicePayload(serviceCategory()->id));
    $b = $this->service->createBanner(servicePayload(serviceCategory()->id));
    $c = $this->service->createBanner(servicePayload(serviceCategory()->id));

    $this->service->reorderBanners([$c->id, $b->id, $a->id]);

    expect($a->refresh()->display_order)->toBe(2);
    expect($b->refresh()->display_order)->toBe(1);
    expect($c->refresh()->display_order)->toBe(0);

    expect(AuditLog::query()->where('action', 'reordered')->count())->toBe(3);
    $reorderedC = AuditLog::query()
        ->where('entity', 'HomepageBanner')->where('action', 'reordered')
        ->where('entity_id', $c->id)->firstOrFail();
    expect($reorderedC->metadata)->toBe(['display_order' => 0]);
});

test('reorderBanners rejects a list containing a missing banner', function () {
    $a = $this->service->createBanner(servicePayload(serviceCategory()->id));

    expect(fn () => $this->service->reorderBanners([$a->id, 99999]))
        ->toThrow(BannerValidationException::class, 'Every banner in the reorder list must exist.');
});

// ─── Delete ──────────────────────────────────────────────────────────────────

test('delete writes the audit entry before removing the banner', function () {
    $banner = $this->service->createBanner(servicePayload(serviceCategory()->id));

    $this->service->deleteBanner($banner);

    $deletedLog = AuditLog::query()
        ->where('entity', 'HomepageBanner')
        ->where('action', 'deleted')
        ->firstOrFail();
    expect((int) $deletedLog->entity_id)->toBe($banner->id);
    expect($deletedLog->actor_id)->toBe($this->user->id);

    expect(HomepageBanner::query()->find($banner->id))->toBeNull();
});
