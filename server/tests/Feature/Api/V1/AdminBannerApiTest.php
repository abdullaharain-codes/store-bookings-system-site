<?php

use App\Models\Asset;
use App\Models\AuditLog;
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
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

function adminCategory(): Category
{
    return Category::factory()->create(['is_published' => true]);
}

function adminBannerPayload(int $categoryId): array
{
    return [
        'asset_id' => Asset::factory()->create()->id,
        'target_category_id' => $categoryId,
    ];
}

function adminBannerEndpoints(HomepageBanner $banner): array
{
    return [
        ['getJson', '/api/v1/admin/homepage-banners', []],
        ['postJson', '/api/v1/admin/homepage-banners', adminBannerPayload(adminCategory()->id)],
        ['getJson', "/api/v1/admin/homepage-banners/{$banner->id}"],
        ['putJson', "/api/v1/admin/homepage-banners/{$banner->id}", adminBannerPayload(adminCategory()->id)],
        ['deleteJson', "/api/v1/admin/homepage-banners/{$banner->id}"],
        ['postJson', "/api/v1/admin/homepage-banners/{$banner->id}/publish"],
        ['postJson', "/api/v1/admin/homepage-banners/{$banner->id}/unpublish"],
        ['postJson', '/api/v1/admin/homepage-banners/reorder', ['ordered_ids' => [$banner->id]]],
    ];
}

// ─── Authorization ────────────────────────────────────────────────────────────

test('guest gets 401 on every admin banner endpoint', function () {
    $banner = HomepageBanner::factory()->create();

    foreach (adminBannerEndpoints($banner) as [$method, $uri]) {
        $this->{$method}($uri)->assertStatus(401);
    }
});

test('customer gets 403 on every admin banner endpoint', function () {
    $banner = HomepageBanner::factory()->create();

    foreach (adminBannerEndpoints($banner) as [$method, $uri]) {
        $this->actingAs($this->customer)->{$method}($uri)->assertStatus(403);
    }
});

// ─── Admin CRUD happy paths ──────────────────────────────────────────────────

test('admin list includes unpublished banners with pagination envelope', function () {
    $published = HomepageBanner::factory()->published()->create();
    $draft = HomepageBanner::factory()->create();

    $response = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/homepage-banners');

    $response->assertOk()
        ->assertJsonStructure([
            'data',
            'links',
            'current_page',
            'total',
            'per_page',
        ]);

    expect($response->json('total'))->toBe(2);

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toContain($published->id)->toContain($draft->id);
});

test('admin list filters by search (target category name) and status', function () {
    $laptops = adminCategory();
    $monitors = adminCategory();
    HomepageBanner::factory()->create(['target_category_id' => $laptops->id, 'is_published' => true]);
    HomepageBanner::factory()->create(['target_category_id' => $monitors->id, 'is_published' => false]);

    $searched = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/homepage-banners?search='.$laptops->name);

    expect($searched->json('total'))->toBe(1)
        ->and($searched->json('data.0.target_category.id'))->toBe($laptops->id);

    $publishedOnly = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/homepage-banners?status=published');

    expect($publishedOnly->json('total'))->toBe(1)
        ->and($publishedOnly->json('data.0.is_published'))->toBeTrue();
});

test('admin can create a published banner and audits the creation', function () {
    $category = adminCategory();
    $assetId = Asset::factory()->create()->id;

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/homepage-banners', [
            'asset_id' => $assetId,
            'target_category_id' => $category->id,
            'display_order' => 2,
            'is_published' => true,
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('banner.target_category_id', $category->id)
        ->assertJsonPath('banner.asset_id', $assetId)
        ->assertJsonPath('banner.display_order', 2)
        ->assertJsonPath('banner.is_published', true)
        ->assertJsonPath('banner.target_category.slug', $category->slug);

    $this->assertDatabaseHas('homepage_banners', [
        'asset_id' => $assetId,
        'target_category_id' => $category->id,
    ]);

    expect(AuditLog::where([
        ['entity', 'HomepageBanner'],
        ['action', 'created'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

test('banner creation rejects an unpublished target with the business message', function () {
    $hidden = Category::factory()->create(['is_published' => false]);

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/homepage-banners', [
            'asset_id' => Asset::factory()->create()->id,
            'target_category_id' => $hidden->id,
        ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'A banner must target a published category.');
});

test('banner creation fails validation for unknown asset or missing target', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/homepage-banners', [
            'asset_id' => 99999,
            'target_category_id' => adminCategory()->id,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['asset_id']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/homepage-banners', [
            'asset_id' => Asset::factory()->create()->id,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['target_category_id']);
});

test('admin can view a single banner with its nested destination', function () {
    $banner = HomepageBanner::factory()->create();

    $this->actingAs($this->admin)
        ->getJson("/api/v1/admin/homepage-banners/{$banner->id}")
        ->assertOk()
        ->assertJsonPath('banner.id', $banner->id)
        ->assertJsonPath('banner.target_category.id', $banner->target_category_id);
});

test('admin can re-point a banner and it sticks immediately', function () {
    $targetA = adminCategory();
    $targetB = adminCategory();
    $banner = HomepageBanner::factory()->create(['target_category_id' => $targetA->id]);

    $response = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'target_category_id' => $targetB->id,
        ]);

    $response->assertOk()
        ->assertJsonPath('banner.target_category_id', $targetB->id)
        ->assertJsonPath('banner.target_category.slug', $targetB->slug);

    expect($banner->refresh()->target_category_id)->toBe($targetB->id);

    expect(AuditLog::where([
        ['entity', 'HomepageBanner'],
        ['entity_id', $banner->id],
        ['action', 'updated'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

test('banner update rejects re-pointing onto an unpublished target', function () {
    $hidden = Category::factory()->create(['is_published' => false]);
    $banner = HomepageBanner::factory()->create();

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'target_category_id' => $hidden->id,
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'A banner must target a published category.');
});

test('banner update ignores is_published tampering via HTTP', function () {
    $banner = HomepageBanner::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/homepage-banners/{$banner->id}", [
            'is_published' => true,
        ]);

    expect($banner->refresh()->is_published)->toBeFalse()
        ->and(AuditLog::where('entity_id', $banner->id)->where('action', 'updated')->count())->toBe(0);
});

test('admin can publish and unpublish a banner with audits', function () {
    // Factory default categories are unpublished — banners may only target a
    // published one, so the banner must sit on a live category from the start.
    $banner = HomepageBanner::factory()->create([
        'target_category_id' => adminCategory()->id,
        'is_published' => false,
    ]);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/homepage-banners/{$banner->id}/publish")
        ->assertOk()
        ->assertJsonPath('banner.is_published', true);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/homepage-banners/{$banner->id}/unpublish")
        ->assertOk()
        ->assertJsonPath('banner.is_published', false);

    expect(AuditLog::where([
        ['entity', 'HomepageBanner'],
        ['entity_id', $banner->id],
        ['action', 'published'],
    ])->exists())->toBeTrue()
        ->and(AuditLog::where([
            ['entity', 'HomepageBanner'],
            ['entity_id', $banner->id],
            ['action', 'unpublished'],
        ])->exists())->toBeTrue();
});

test('publishing a banner whose target category was unpublished returns 422', function () {
    $category = adminCategory();
    $banner = HomepageBanner::factory()->create(['target_category_id' => $category->id, 'is_published' => true]);
    $category->update(['is_published' => false]);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/homepage-banners/{$banner->id}/publish")
        ->assertStatus(422)
        ->assertJsonPath('message', 'A banner must target a published category.');
});

test('admin can reorder the carousel via the dedicated endpoint', function () {
    $a = HomepageBanner::factory()->create();
    $b = HomepageBanner::factory()->create();
    $c = HomepageBanner::factory()->create();

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/homepage-banners/reorder', [
            'ordered_ids' => [$c->id, $b->id, $a->id],
        ])
        ->assertOk()
        ->assertJson(['message' => 'Banners reordered.']);

    expect($a->refresh()->display_order)->toBe(2);
    expect($b->refresh()->display_order)->toBe(1);
    expect($c->refresh()->display_order)->toBe(0);

    expect(AuditLog::where('entity', 'HomepageBanner')
        ->where('action', 'reordered')
        ->where('actor_id', $this->admin->id)->count())->toBe(3);
});

test('reorder rejects an unknown banner id', function () {
    $banner = HomepageBanner::factory()->create();

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/homepage-banners/reorder', [
            'ordered_ids' => [$banner->id, 99999],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['ordered_ids.1']);
});

test('admin can delete a banner', function () {
    $banner = HomepageBanner::factory()->create();
    $id = $banner->id;

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/homepage-banners/{$id}")
        ->assertOk()
        ->assertJson(['message' => 'Banner deleted.']);

    $this->assertDatabaseMissing('homepage_banners', ['id' => $id]);

    expect(AuditLog::where([
        ['entity', 'HomepageBanner'],
        ['entity_id', $id],
        ['action', 'deleted'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});
