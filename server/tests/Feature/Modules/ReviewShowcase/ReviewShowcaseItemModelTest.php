<?php

use App\Models\ReviewShowcaseItem;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('review_showcase_items table exists with the expected columns', function () {
    expect(Schema::hasTable('review_showcase_items'))->toBeTrue();

    foreach ([
        'id',
        'asset_id',
        'caption',
        'display_order',
        'is_published',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('review_showcase_items', $column))->toBeTrue();
    }
});

test('display_order and publish state carry the expected indexes', function () {
    $indexes = collect(DB::select("PRAGMA index_list('review_showcase_items')"))
        ->pluck('name');

    expect($indexes)->toContain('review_showcase_items_display_order_index');
    expect($indexes)->toContain('review_showcase_items_is_published_index');
});

test('asset is a required RESTRICT foreign key (mirrors homepage_banners)', function () {
    $fks = collect(DB::select("PRAGMA foreign_key_list('review_showcase_items')"))
        ->keyBy('from');

    expect($fks->get('asset_id')->table)->toBe('assets')
        ->and($fks->get('asset_id')->on_delete)->toBe('RESTRICT');
});

test('deleting an asset in use by a showcase item is blocked', function () {
    $item = ReviewShowcaseItem::factory()->create();

    expect(fn () => $item->asset->delete())->toThrow(QueryException::class);
});

test('factory creates an unpublished item at order 0 with a real asset', function () {
    $item = ReviewShowcaseItem::factory()->create();

    $this->assertDatabaseHas('review_showcase_items', ['id' => $item->id]);

    expect($item->is_published)->toBeFalse();
    expect($item->display_order)->toBe(0);
    expect($item->caption)->toBeNull();

    expect($item->asset)->not->toBeNull();
});

test('published() and ordered() states drive the carousel feed', function () {
    $published = ReviewShowcaseItem::factory()->published()->ordered(4)->create();

    expect($published->is_published)->toBeTrue();
    expect($published->display_order)->toBe(4);
});
