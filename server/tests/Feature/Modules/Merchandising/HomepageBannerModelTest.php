<?php

use App\Models\Asset;
use App\Models\Category;
use App\Models\HomepageBanner;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('homepage_banners table exists with the expected columns', function () {
    expect(Schema::hasTable('homepage_banners'))->toBeTrue();

    foreach ([
        'id',
        'asset_id',
        'target_category_id',
        'display_order',
        'is_published',
        'start_at',
        'end_at',
        'headline',
        'subtitle',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('homepage_banners', $column))->toBeTrue();
    }
});

test('the optional overlay text columns are nullable so a banner can be image only', function () {
    // BE1: null is a meaningful state, not missing data — see the migration.
    // Read the flag from the schema itself rather than trusting a helper, the
    // same way the index/FK tests above read PRAGMA directly.
    $columns = collect(DB::select("PRAGMA table_info('homepage_banners')"))
        ->keyBy('name');

    foreach (['headline', 'subtitle'] as $column) {
        expect($columns)->toHaveKey($column)
            ->and($columns[$column]->notnull)->toEqual(0);
    }

    // And the default definition really does accept a null overlay.
    $banner = HomepageBanner::factory()->create();

    expect($banner->headline)->toBeNull()->and($banner->subtitle)->toBeNull();
});

test('display order and publish state carry the expected indexes', function () {
    $indexes = collect(DB::select("PRAGMA index_list('homepage_banners')"))
        ->pluck('name');

    expect($indexes)->toContain('homepage_banners_display_order_index');
    expect($indexes)->toContain('homepage_banners_is_published_index');
});

test('foreign keys are real RESTRICT constraints against assets and categories', function () {
    $fks = collect(DB::select("PRAGMA foreign_key_list('homepage_banners')"))
        ->keyBy('from');

    // The destination relationship (PRD §8) must never dangle: the asset is
    // REQUIRED and both FKs are RESTRICT per architecture.md §4.
    expect($fks->get('asset_id')->table)->toBe('assets')
        ->and($fks->get('asset_id')->on_delete)->toBe('RESTRICT');

    expect($fks->get('target_category_id')->table)->toBe('categories')
        ->and($fks->get('target_category_id')->on_delete)->toBe('RESTRICT');
});

test('factory creates an unpublished banner with no scheduling window', function () {
    $banner = HomepageBanner::factory()->create();

    $this->assertDatabaseHas('homepage_banners', ['id' => $banner->id]);

    expect($banner->is_published)->toBeFalse();
    expect($banner->display_order)->toBe(0);
    // Null start/end = always active (architecture.md §4 scheduling is out of scope).
    expect($banner->start_at)->toBeNull();
    expect($banner->end_at)->toBeNull();

    // Relationships resolve to real rows — the image and the live destination.
    expect($banner->asset)->not->toBeNull();
    expect($banner->targetCategory)->not->toBeNull();
    expect($banner->targetCategory->getAttribute('id'))->toBe($banner->target_category_id);
});

test('published() and ordered() states configure the banner for the carousel', function () {
    $banner = HomepageBanner::factory()->published()->ordered(3)->create();

    expect($banner->is_published)->toBeTrue();
    expect($banner->display_order)->toBe(3);
});

test('deleting an asset still referenced by a banner is restricted', function () {
    $banner = HomepageBanner::factory()->create();
    $asset = $banner->asset;

    expect(fn () => $asset->delete())->toThrow(QueryException::class);

    $this->assertDatabaseHas('assets', ['id' => $asset->id]);
});

test('deleting a category still referenced by a banner is restricted', function () {
    // PRD §8: the banner holds a real FK to its destination category, so a
    // category in use by a banner cannot be silently torn out from under it.
    $banner = HomepageBanner::factory()->create();
    $category = $banner->targetCategory;

    expect(fn () => $category->delete())->toThrow(QueryException::class);

    $this->assertDatabaseHas('categories', ['id' => $category->id]);
});

test('orphan Asset model rows still exist for the factory without a physical file', function () {
    // AssetFactory is test-only: it persists a row on the 'uploads' disk but
    // writes no physical file — the row is what the FK holds on to.
    $banner = HomepageBanner::factory()->create();

    expect(Asset::query()->find($banner->asset_id))->not->toBeNull();
    expect(Category::query()->find($banner->target_category_id))->not->toBeNull();
});
