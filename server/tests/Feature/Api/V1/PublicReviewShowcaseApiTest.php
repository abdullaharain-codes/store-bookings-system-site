<?php

use App\Models\ReviewShowcaseItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
});

test('public showcase feed needs no auth', function () {
    ReviewShowcaseItem::factory()->published()->create();

    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->getJson('/api/v1/review-showcase')->assertOk();
});

test('public showcase feed returns only published items in display order', function () {
    ReviewShowcaseItem::factory()->ordered(2)->published()->create();
    ReviewShowcaseItem::factory()->ordered(0)->published()->create();
    ReviewShowcaseItem::factory()->ordered(1)->create(); // draft
    ReviewShowcaseItem::factory()->ordered(3)->published()->create();

    $response = $this->getJson('/api/v1/review-showcase');

    $response->assertOk()
        ->assertJsonStructure(['review_showcase_items' => ['data', 'links', 'total']]);

    $ids = collect($response->json('review_showcase_items.data'))->pluck('id')->all();

    expect($ids)->toBe([
        ReviewShowcaseItem::where('display_order', 0)->value('id'),
        ReviewShowcaseItem::where('display_order', 2)->value('id'),
        ReviewShowcaseItem::where('display_order', 3)->value('id'),
    ])->and($response->json('review_showcase_items.total'))->toBe(3);
});

test('public showcase items carry the nested asset', function () {
    $item = ReviewShowcaseItem::factory()->published()->create(['caption' => 'Screenshot']);

    $this->getJson('/api/v1/review-showcase')
        ->assertOk()
        ->assertJsonPath('review_showcase_items.data.0.asset.id', $item->asset_id)
        ->assertJsonPath('review_showcase_items.data.0.asset_id', $item->asset_id)
        ->assertJsonPath('review_showcase_items.data.0.caption', 'Screenshot');
});

test('unpublishing a showcase item drops it from the feed on the next load', function () {
    $item = ReviewShowcaseItem::factory()->published()->create();

    expect($this->getJson('/api/v1/review-showcase')->json('review_showcase_items.total'))->toBe(1);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/review-showcase/{$item->id}/unpublish")
        ->assertOk();

    expect($this->getJson('/api/v1/review-showcase')->json('review_showcase_items.total'))->toBe(0);
});

test('an empty showcase returns an empty paginated feed', function () {
    $this->getJson('/api/v1/review-showcase')
        ->assertOk()
        ->assertJsonPath('review_showcase_items.data', [])
        ->assertJsonPath('review_showcase_items.total', 0);
});

test('an unpublished item is indistinguishable from no item on the public feed', function () {
    // The showcase is a single global feed, so the comparison runs in time:
    // while a hidden item exists the payload must be byte-identical to the
    // identical request after the item is gone — publish status is never an
    // oracle for what exists.
    $item = ReviewShowcaseItem::factory()->create(['caption' => 'Hidden pretty content']);

    $withHidden = $this->getJson('/api/v1/review-showcase');

    $item->delete();

    $bare = $this->getJson('/api/v1/review-showcase');

    $withHidden->assertOk();
    $bare->assertOk();

    expect($withHidden->json('review_showcase_items'))
        ->toBe($bare->json('review_showcase_items'))
        ->and($withHidden->json('review_showcase_items.data'))->toBe([])
        ->and($withHidden->json('review_showcase_items.total'))->toBe(0);
});
