<?php

use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\User;
use App\Modules\Taxonomy\Exceptions\BrandValidationException;
use App\Modules\Taxonomy\Services\BrandService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(BrandService::class);
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

// ─── Slug handling ───────────────────────────────────────────────────────────

test('create generates slug automatically from name', function () {
    $brand = $this->service->createBrand(['name' => 'LogiTech Clone']);

    expect($brand->slug)->toBe('logitech-clone');
});

test('create appends numeric suffixes on auto-generated slug collision', function () {
    $first = $this->service->createBrand(['name' => 'Acme']);
    $second = $this->service->createBrand(['name' => 'Acme']);

    expect($first->slug)->toBe('acme');
    expect($second->slug)->toBe('acme-2');
});

test('create throws when an explicitly provided slug is already taken', function () {
    $this->service->createBrand(['name' => 'Existing Brand']);

    expect(fn () => $this->service->createBrand([
        'name' => 'Other Brand',
        'slug' => 'existing-brand',
    ]))->toThrow(BrandValidationException::class);
});

test('update accepts the brand keeping its own slug (excludes self)', function () {
    $brand = $this->service->createBrand(['name' => 'Zeta', 'slug' => 'zeta']);
    $this->service->createBrand(['name' => 'Omega']);

    $updated = $this->service->updateBrand($brand, ['name' => 'Zeta Updated', 'slug' => 'zeta']);

    expect($updated->refresh()->slug)->toBe('zeta');
});

// ─── Publication + audit trail ───────────────────────────────────────────────

test('publish and unpublish write audit rows with actor and previous state', function () {
    $brand = $this->service->createBrand(['name' => 'Audited Brand']);

    $this->service->publish($brand);

    $publishedLog = AuditLog::query()
        ->where('entity', 'Brand')
        ->where('action', 'published')
        ->firstOrFail();
    expect($publishedLog->entity_id)->toBe($brand->id);
    expect($publishedLog->actor_id)->toBe($this->user->id);
    expect($publishedLog->metadata)->toBe(['previous' => false]);

    $this->service->unpublish($brand);

    $unpublishedLog = AuditLog::query()
        ->where('entity', 'Brand')
        ->where('action', 'unpublished')
        ->firstOrFail();
    expect($unpublishedLog->entity_id)->toBe($brand->id);
    expect($unpublishedLog->actor_id)->toBe($this->user->id);
    expect($unpublishedLog->metadata)->toBe(['previous' => true]);
    expect($brand->refresh()->is_published)->toBeFalse();
});

test('delete writes the audit entry before removing the brand', function () {
    $brand = $this->service->createBrand(['name' => 'Doomed Brand']);

    $this->service->deleteBrand($brand);

    $deletedLog = AuditLog::query()
        ->where('entity', 'Brand')
        ->where('action', 'deleted')
        ->firstOrFail();
    expect((int) $deletedLog->entity_id)->toBe($brand->id);

    expect(Brand::query()->find($brand->id))->toBeNull();
});
