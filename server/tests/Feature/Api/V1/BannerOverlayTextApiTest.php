<?php

use App\Models\Asset;
use App\Models\Category;
use App\Models\HomepageBanner;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * TASK BE1 (2026-10-03) — homepage_banners.headline / .subtitle.
 *
 * Two optional overlay-text columns on the hero banner, approved by the product
 * owner so design.md §3.7's "optional overlay text" is actually authorable.
 * Both are nullable: null means "this banner is image only" (rules.md §6
 * requires that reason to be documented — it is, in the migration).
 *
 * Helper names are prefixed `overlay*` because the sibling banner test files
 * already declare global `adminCategory()` / `publicCategory()` helpers, and
 * Pest loads every Feature file into one process.
 */
uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->overlayAdmin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->overlayCustomer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

function overlayPublishedCategory(): Category
{
    return Category::factory()->create(['is_published' => true]);
}

function overlayStorePayload(array $overrides = []): array
{
    return array_merge([
        'asset_id' => Asset::factory()->create()->id,
        'target_category_id' => overlayPublishedCategory()->id,
    ], $overrides);
}

// ─── 1. Admin create with overlay text, echoed back ───────────────────────────

test('admin creates a banner with headline and subtitle and receives them back', function () {
    $payload = overlayStorePayload([
        'headline' => 'Summer laptop sale',
        'subtitle' => 'Up to 40% off selected models this week.',
    ]);

    $response = $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', $payload);

    $response->assertStatus(201)
        ->assertJsonPath('banner.headline', 'Summer laptop sale')
        ->assertJsonPath('banner.subtitle', 'Up to 40% off selected models this week.');

    $this->assertDatabaseHas('homepage_banners', [
        'headline' => 'Summer laptop sale',
        'subtitle' => 'Up to 40% off selected models this week.',
    ]);
});

// ─── 2. Admin create without overlay text → both null ─────────────────────────

test('admin creates a banner without overlay text and both fields come back null', function () {
    $response = $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload());

    $response->assertStatus(201)
        ->assertJsonPath('banner.headline', null)
        ->assertJsonPath('banner.subtitle', null);

    $banner = HomepageBanner::query()->latest('id')->first();

    expect($banner->headline)->toBeNull()
        ->and($banner->subtitle)->toBeNull();
});

// ─── 3. Update changes them ───────────────────────────────────────────────────

test('update changes headline and subtitle', function () {
    $banner = HomepageBanner::factory()->create([
        'headline' => 'Old headline',
        'subtitle' => 'Old subtitle',
    ]);

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'headline' => 'New headline',
            'subtitle' => 'New subtitle',
        ])
        ->assertOk()
        ->assertJsonPath('banner.headline', 'New headline')
        ->assertJsonPath('banner.subtitle', 'New subtitle');

    expect($banner->refresh()->headline)->toBe('New headline')
        ->and($banner->subtitle)->toBe('New subtitle');
});

// ─── 4. Update clears them back to null (explicit null and empty string) ──────

test('update with explicit null clears headline and subtitle', function () {
    $banner = HomepageBanner::factory()->create([
        'headline' => 'Present headline',
        'subtitle' => 'Present subtitle',
    ]);

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'headline' => null,
            'subtitle' => null,
        ])
        ->assertOk()
        ->assertJsonPath('banner.headline', null)
        ->assertJsonPath('banner.subtitle', null);

    expect($banner->refresh()->headline)->toBeNull()
        ->and($banner->subtitle)->toBeNull();
});

test('an empty string clears overlay text back to null', function () {
    $banner = HomepageBanner::factory()->create([
        'headline' => 'Present headline',
        'subtitle' => 'Present subtitle',
    ]);

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'headline' => '',
            'subtitle' => '',
        ])
        ->assertOk()
        ->assertJsonPath('banner.headline', null)
        ->assertJsonPath('banner.subtitle', null);

    expect($banner->refresh()->headline)->toBeNull()
        ->and($banner->subtitle)->toBeNull();
});

// ─── Trimming ────────────────────────────────────────────────────────────────

test('overlay text is trimmed before it is stored', function () {
    $response = $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => '   Summer laptop sale   ',
            'subtitle' => "\t Up to 40% off. \n",
        ]));

    $response->assertStatus(201)
        ->assertJsonPath('banner.headline', 'Summer laptop sale')
        ->assertJsonPath('banner.subtitle', 'Up to 40% off.');
});

test('whitespace-only overlay text stores as null rather than an empty string', function () {
    $response = $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => '   ',
            'subtitle' => '  ',
        ]));

    $response->assertStatus(201)
        ->assertJsonPath('banner.headline', null)
        ->assertJsonPath('banner.subtitle', null);
});

// ─── 5. Length validation ────────────────────────────────────────────────────

test('headline longer than 120 characters is rejected', function () {
    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => str_repeat('a', 121),
        ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['headline']);
});

test('subtitle longer than 255 characters is rejected', function () {
    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'subtitle' => str_repeat('b', 256),
        ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subtitle']);
});

test('headline of exactly 120 characters and subtitle of exactly 255 are accepted', function () {
    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => str_repeat('a', 120),
            'subtitle' => str_repeat('b', 255),
        ]))
        ->assertStatus(201)
        ->assertJsonPath('banner.headline', str_repeat('a', 120))
        ->assertJsonPath('banner.subtitle', str_repeat('b', 255));
});

test('update also enforces the overlay text length limits', function () {
    $banner = HomepageBanner::factory()->create();

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'headline' => str_repeat('a', 121),
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['headline']);

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'subtitle' => str_repeat('b', 256),
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subtitle']);
});

// ─── 6. HTML rejection ───────────────────────────────────────────────────────

test('overlay text containing an HTML tag is rejected', function () {
    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => '<b>Summer sale</b>',
        ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['headline']);

    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'subtitle' => '<script>alert(1)</script>',
        ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subtitle']);
});

test('a rejected HTML tag is never written to the database', function () {
    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => '<img src=x onerror=alert(1)>',
        ]))
        ->assertStatus(422);

    expect(HomepageBanner::query()->where('headline', '<img src=x onerror=alert(1)>')->exists())->toBeFalse();
});

test('legitimate punctuation that is not a tag is still accepted', function () {
    // Guards the tag-shape rule against over-rejecting: '<' followed by a
    // non-letter (or with no closing '>') is not a tag and must pass through.
    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners', overlayStorePayload([
            'headline' => 'Save <50% today',
            'subtitle' => 'Only 3 left < hurry',
        ]))
        ->assertStatus(201)
        ->assertJsonPath('banner.headline', 'Save <50% today')
        ->assertJsonPath('banner.subtitle', 'Only 3 left < hurry');
});

test('HTML tags are rejected on update too', function () {
    $banner = HomepageBanner::factory()->create();

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'headline' => '<em>nope</em>',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['headline']);
});

// ─── 7. Public feed ──────────────────────────────────────────────────────────

test('the public carousel returns overlay text for published banners', function () {
    HomepageBanner::factory()->published()->create([
        'target_category_id' => overlayPublishedCategory()->id,
        'headline' => 'Summer laptop sale',
        'subtitle' => 'Up to 40% off selected models.',
    ]);

    $this->getJson('/api/v1/homepage-banners')
        ->assertOk()
        ->assertJsonPath('banners.0.headline', 'Summer laptop sale')
        ->assertJsonPath('banners.0.subtitle', 'Up to 40% off selected models.');
});

test('the public carousel returns null overlay text when the banner has none', function () {
    HomepageBanner::factory()->published()->create([
        'target_category_id' => overlayPublishedCategory()->id,
    ]);

    $response = $this->getJson('/api/v1/homepage-banners');

    $response->assertOk()
        ->assertJsonPath('banners.0.headline', null)
        ->assertJsonPath('banners.0.subtitle', null);

    // The keys must be present even when null, so the frontend can rely on the
    // shape instead of probing for existence.
    expect(array_key_exists('headline', $response->json('banners.0')))->toBeTrue()
        ->and(array_key_exists('subtitle', $response->json('banners.0')))->toBeTrue();
});

test('an unpublished banner keeps its overlay text off the public feed', function () {
    $live = HomepageBanner::factory()->published()->create([
        'target_category_id' => overlayPublishedCategory()->id,
        'headline' => 'Live headline',
        'subtitle' => 'Live subtitle',
    ]);
    HomepageBanner::factory()->create([
        'target_category_id' => overlayPublishedCategory()->id,
        'is_published' => false,
        'headline' => 'Draft headline',
        'subtitle' => 'Draft subtitle',
    ]);

    $response = $this->getJson('/api/v1/homepage-banners');

    expect(count($response->json('banners')))->toBe(1)
        ->and($response->json('banners.0.id'))->toBe($live->id)
        ->and($response->json('banners.0.headline'))->toBe('Live headline');

    expect(json_encode($response->json('banners')))->not->toContain('Draft headline');
});

test('a published banner whose target category was unpublished stays off the public feed', function () {
    $revoked = overlayPublishedCategory();
    HomepageBanner::factory()->create([
        'target_category_id' => $revoked->id,
        'is_published' => true,
        'headline' => 'Revoked headline',
        'subtitle' => 'Revoked subtitle',
    ]);
    $revoked->update(['is_published' => false]);

    expect($this->getJson('/api/v1/homepage-banners')->json('banners'))->toBe([]);
});

test('the admin listing and detail endpoints expose overlay text', function () {
    $banner = HomepageBanner::factory()->create([
        'headline' => 'Admin visible headline',
        'subtitle' => 'Admin visible subtitle',
    ]);

    $this->actingAs($this->overlayAdmin)
        ->getJson('/api/v1/admin/homepage-banners')
        ->assertOk()
        ->assertJsonPath('data.0.headline', 'Admin visible headline')
        ->assertJsonPath('data.0.subtitle', 'Admin visible subtitle');

    $this->actingAs($this->overlayAdmin)
        ->getJson("/api/v1/admin/homepage-banners/{$banner->id}")
        ->assertOk()
        ->assertJsonPath('banner.headline', 'Admin visible headline')
        ->assertJsonPath('banner.subtitle', 'Admin visible subtitle');
});

test('publishing a banner does not change its overlay text', function () {
    $banner = HomepageBanner::factory()->create([
        'target_category_id' => overlayPublishedCategory()->id,
        'is_published' => false,
        'headline' => 'Kept headline',
        'subtitle' => 'Kept subtitle',
    ]);

    $this->actingAs($this->overlayAdmin)
        ->postJson("/api/v1/admin/homepage-banners/{$banner->id}/publish")
        ->assertOk()
        ->assertJsonPath('banner.headline', 'Kept headline')
        ->assertJsonPath('banner.subtitle', 'Kept subtitle');
});

// ─── Model / schema ──────────────────────────────────────────────────────────

test('the model persists headline and subtitle and reads them back as strings or null', function () {
    $withText = HomepageBanner::factory()->create([
        'headline' => 'Persisted headline',
        'subtitle' => 'Persisted subtitle',
    ]);
    $withoutText = HomepageBanner::factory()->create();

    expect($withText->refresh()->headline)->toBe('Persisted headline')
        ->and($withText->subtitle)->toBe('Persisted subtitle')
        ->and($withoutText->refresh()->headline)->toBeNull()
        ->and($withoutText->subtitle)->toBeNull();
});

test('the factory defaults overlay text to null and offers a withOverlayText state', function () {
    $plain = HomepageBanner::factory()->create();

    expect($plain->headline)->toBeNull()->and($plain->subtitle)->toBeNull();

    $texted = HomepageBanner::factory()->withOverlayText()->create();

    expect($texted->headline)->toBeString()
        ->and($texted->subtitle)->toBeString()
        ->and(strlen($texted->headline))->toBeGreaterThan(0)
        ->and(strlen($texted->subtitle))->toBeGreaterThan(0);
});

test('update writes only the overlay fields when nothing else is sent', function () {
    $banner = HomepageBanner::factory()->create([
        'display_order' => 7,
        'headline' => 'Original headline',
    ]);

    $this->actingAs($this->overlayAdmin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'subtitle' => 'Only subtitle touched',
        ])
        ->assertOk();

    $fresh = $banner->refresh();

    expect($fresh->subtitle)->toBe('Only subtitle touched')
        ->and($fresh->headline)->toBe('Original headline')
        ->and($fresh->display_order)->toBe(7);
});

test('overlay text cannot be set through the reorder endpoint', function () {
    $banner = HomepageBanner::factory()->create(['headline' => 'Untouched headline']);

    $this->actingAs($this->overlayAdmin)
        ->postJson('/api/v1/admin/homepage-banners/reorder', [
            'ordered_ids' => [$banner->id],
        ])
        ->assertOk();

    expect($banner->refresh()->headline)->toBe('Untouched headline');
});
