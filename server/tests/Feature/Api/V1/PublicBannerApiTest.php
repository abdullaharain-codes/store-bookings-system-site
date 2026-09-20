<?php

use App\Models\Category;
use App\Models\HomepageBanner;
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

function publicCategory(): Category
{
    return Category::factory()->create(['is_published' => true]);
}

test('public banners index returns only published banners whose target category is published', function () {
    $liveTarget = publicCategory();
    $hiddenTarget = publicCategory();

    HomepageBanner::factory()->create(['target_category_id' => $liveTarget->id, 'is_published' => true]);
    HomepageBanner::factory()->create(['target_category_id' => $hiddenTarget->id, 'is_published' => false]);
    // Draft banner alongside a live one, same live target.
    HomepageBanner::factory()->create(['target_category_id' => $liveTarget->id, 'is_published' => false]);

    // A published banner whose destination was later unpublished (only possible
    // at the DB layer) must never surface — clicking it would hit a dead 404.
    $revokedTarget = publicCategory();
    HomepageBanner::factory()->create(['target_category_id' => $revokedTarget->id, 'is_published' => true]);
    $revokedTarget->update(['is_published' => false]);

    $response = $this->getJson('/api/v1/homepage-banners');

    $response->assertOk()->assertJsonStructure(['banners']);

    expect(count($response->json('banners')))->toBe(1)
        ->and($response->json('banners.0.target_category_id'))->toBe($liveTarget->id);
});

test('public banners carry the nested target category the frontend navigates by', function () {
    $category = publicCategory();
    HomepageBanner::factory()->create(['target_category_id' => $category->id, 'is_published' => true]);

    $response = $this->getJson('/api/v1/homepage-banners');

    $response->assertOk()
        ->assertJsonPath('banners.0.target_category.slug', $category->slug)
        ->assertJsonPath('banners.0.target_category.id', $category->id)
        ->assertJsonPath('banners.0.asset_id', HomepageBanner::first()->asset_id);
});

test('public banners are ordered by admin-defined display order', function () {
    $category = publicCategory();
    HomepageBanner::factory()->ordered(2)->published()->create(['target_category_id' => $category->id]);
    HomepageBanner::factory()->ordered(0)->published()->create(['target_category_id' => $category->id]);
    HomepageBanner::factory()->ordered(1)->published()->create(['target_category_id' => $category->id]);

    $ids = collect($this->getJson('/api/v1/homepage-banners')->json('banners'))->pluck('id')->all();

    expect($ids)->toBe([
        HomepageBanner::where('display_order', 0)->value('id'),
        HomepageBanner::where('display_order', 1)->value('id'),
        HomepageBanner::where('display_order', 2)->value('id'),
    ]);
});

test('re-pointing a banner updates the live click destination immediately', function () {
    // phases.md Step 8.5 criterion: re-targeting a published banner must change
    // the destination the public carousel serves, without any re-publish step.
    $targetA = publicCategory();
    $targetB = publicCategory();
    $banner = HomepageBanner::factory()->create(['target_category_id' => $targetA->id, 'is_published' => true]);

    $before = $this->getJson('/api/v1/homepage-banners');
    expect($before->json('banners.0.target_category.slug'))->toBe($targetA->slug);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'target_category_id' => $targetB->id,
        ])
        ->assertOk();

    $after = $this->getJson('/api/v1/homepage-banners');
    expect($after->json('banners.0.target_category.slug'))->toBe($targetB->slug)
        ->and($after->json('banners.0.target_category.id'))->toBe($targetB->id);
});

test('unpublishing a banner drops it from the carousel on the next load', function () {
    $banner = HomepageBanner::factory()->published()->create(['target_category_id' => publicCategory()->id]);

    expect(count($this->getJson('/api/v1/homepage-banners')->json('banners')))->toBe(1);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/homepage-banners/{$banner->id}/unpublish")
        ->assertOk();

    expect(count($this->getJson('/api/v1/homepage-banners')->json('banners')))->toBe(0);
});

test('an empty carousel returns an empty list', function () {
    $this->getJson('/api/v1/homepage-banners')
        ->assertOk()
        ->assertExactJson(['banners' => []]);
});

test('public banner feed stays fully public (no auth required)', function () {
    HomepageBanner::factory()->published()->create(['target_category_id' => publicCategory()->id]);

    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->getJson('/api/v1/homepage-banners')->assertOk();
});

test('the asset referenced by a banner is required to be a real row', function () {
    $banner = HomepageBanner::factory()->published()->create(['target_category_id' => publicCategory()->id]);

    $this->getJson('/api/v1/homepage-banners')
        ->assertJsonPath('banners.0.asset_id', $banner->asset_id);
});
