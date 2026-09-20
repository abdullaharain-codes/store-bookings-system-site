<?php

use App\Models\Asset;
use App\Models\AuditLog;
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
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

function adminShowcasePayload(): array
{
    return [
        'asset_id' => Asset::factory()->create()->id,
    ];
}

function adminShowcaseEndpoints(ReviewShowcaseItem $item): array
{
    return [
        ['getJson', '/api/v1/admin/review-showcase', []],
        ['postJson', '/api/v1/admin/review-showcase', adminShowcasePayload()],
        ['getJson', "/api/v1/admin/review-showcase/{$item->id}"],
        ['putJson', "/api/v1/admin/review-showcase/{$item->id}", adminShowcasePayload()],
        ['deleteJson', "/api/v1/admin/review-showcase/{$item->id}"],
        ['postJson', "/api/v1/admin/review-showcase/{$item->id}/publish"],
        ['postJson', "/api/v1/admin/review-showcase/{$item->id}/unpublish"],
        ['postJson', '/api/v1/admin/review-showcase/reorder', ['ordered_ids' => [$item->id]]],
    ];
}

// ─── Authorization ────────────────────────────────────────────────────────────

test('guest gets 401 on every admin showcase endpoint', function () {
    $item = ReviewShowcaseItem::factory()->create();

    foreach (adminShowcaseEndpoints($item) as [$method, $uri]) {
        $this->{$method}($uri)->assertStatus(401);
    }
});

test('customer gets 403 on every admin showcase endpoint', function () {
    $item = ReviewShowcaseItem::factory()->create();

    foreach (adminShowcaseEndpoints($item) as [$method, $uri]) {
        $this->actingAs($this->customer)->{$method}($uri)->assertStatus(403);
    }
});

// ─── Admin CRUD happy paths ──────────────────────────────────────────────────

test('admin list includes unpublished items with pagination envelope', function () {
    $published = ReviewShowcaseItem::factory()->published()->create();
    $draft = ReviewShowcaseItem::factory()->create();

    $response = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/review-showcase');

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

test('admin list filters by search (caption) and status', function () {
    ReviewShowcaseItem::factory()->create(['caption' => 'Love the new laptop', 'is_published' => true]);
    ReviewShowcaseItem::factory()->create(['caption' => 'The technician was great']);

    $searched = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/review-showcase?search='.rawurlencode('technician'));

    expect($searched->json('total'))->toBe(1)
        ->and($searched->json('data.0.caption'))->toBe('The technician was great');

    $publishedOnly = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/review-showcase?status=published');

    expect($publishedOnly->json('total'))->toBe(1)
        ->and($publishedOnly->json('data.0.is_published'))->toBeTrue();
});

test('admin can create a showcase item unpublished at order 0 and audits it', function () {
    $assetId = Asset::factory()->create()->id;

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/review-showcase', [
            'asset_id' => $assetId,
            'caption' => 'Five stars and a smile',
            'display_order' => 2,
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('review_showcase_item.asset_id', $assetId)
        ->assertJsonPath('review_showcase_item.caption', 'Five stars and a smile')
        ->assertJsonPath('review_showcase_item.display_order', 2)
        ->assertJsonPath('review_showcase_item.is_published', false);

    $this->assertDatabaseHas('review_showcase_items', [
        'asset_id' => $assetId,
        'caption' => 'Five stars and a smile',
    ]);

    expect(AuditLog::where([
        ['entity', 'ReviewShowcaseItem'],
        ['action', 'created'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

test('showcase creation never honors an is_published payload flag', function () {
    $assetId = Asset::factory()->create()->id;

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/review-showcase', [
            'asset_id' => $assetId,
            'is_published' => true,
        ])
        ->assertStatus(201)
        ->assertJsonPath('review_showcase_item.is_published', false);
});

test('showcase creation fails validation for unknown or missing asset', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/review-showcase', [
            'asset_id' => 99999,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['asset_id']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/review-showcase', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['asset_id']);
});

test('admin can view a single showcase item with its nested asset', function () {
    $item = ReviewShowcaseItem::factory()->create();

    $this->actingAs($this->admin)
        ->getJson("/api/v1/admin/review-showcase/{$item->id}")
        ->assertOk()
        ->assertJsonPath('review_showcase_item.id', $item->id)
        ->assertJsonPath('review_showcase_item.asset.id', $item->asset_id);
});

test('admin can update a showcase item and it sticks', function () {
    $item = ReviewShowcaseItem::factory()->create();
    $newAssetId = Asset::factory()->create()->id;

    $response = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/review-showcase/{$item->id}", [
            'asset_id' => $newAssetId,
            'caption' => 'Updated caption',
            'display_order' => 7,
        ]);

    $response->assertOk()
        ->assertJsonPath('review_showcase_item.asset_id', $newAssetId)
        ->assertJsonPath('review_showcase_item.caption', 'Updated caption')
        ->assertJsonPath('review_showcase_item.display_order', 7);

    expect($item->refresh()->asset_id)->toBe($newAssetId);

    expect(AuditLog::where([
        ['entity', 'ReviewShowcaseItem'],
        ['entity_id', $item->id],
        ['action', 'updated'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

test('showcase update ignores is_published tampering via HTTP', function () {
    $item = ReviewShowcaseItem::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/review-showcase/{$item->id}", [
            'is_published' => true,
        ]);

    expect($item->refresh()->is_published)->toBeFalse()
        ->and(AuditLog::where('entity_id', $item->id)->where('action', 'updated')->count())->toBe(0);
});

test('admin can publish and unpublish a showcase item with audits', function () {
    $item = ReviewShowcaseItem::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/review-showcase/{$item->id}/publish")
        ->assertOk()
        ->assertJsonPath('review_showcase_item.is_published', true);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/review-showcase/{$item->id}/unpublish")
        ->assertOk()
        ->assertJsonPath('review_showcase_item.is_published', false);

    expect(AuditLog::where([
        ['entity', 'ReviewShowcaseItem'],
        ['entity_id', $item->id],
        ['action', 'published'],
    ])->exists())->toBeTrue()
        ->and(AuditLog::where([
            ['entity', 'ReviewShowcaseItem'],
            ['entity_id', $item->id],
            ['action', 'unpublished'],
        ])->exists())->toBeTrue();
});

test('repeated publish via HTTP is an idempotent no-op', function () {
    $item = ReviewShowcaseItem::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)->postJson("/api/v1/admin/review-showcase/{$item->id}/publish")->assertOk();
    $this->actingAs($this->admin)->postJson("/api/v1/admin/review-showcase/{$item->id}/publish")->assertOk();

    expect(AuditLog::query()
        ->where('entity', 'ReviewShowcaseItem')
        ->where('action', 'published')
        ->count())->toBe(1);
});

test('admin can reorder the showcase via the dedicated endpoint', function () {
    $a = ReviewShowcaseItem::factory()->create();
    $b = ReviewShowcaseItem::factory()->create();
    $c = ReviewShowcaseItem::factory()->create();

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/review-showcase/reorder', [
            'ordered_ids' => [$c->id, $b->id, $a->id],
        ])
        ->assertOk()
        ->assertJson(['message' => 'Review showcase reordered.']);

    expect($a->refresh()->display_order)->toBe(2);
    expect($b->refresh()->display_order)->toBe(1);
    expect($c->refresh()->display_order)->toBe(0);

    expect(AuditLog::where('entity', 'ReviewShowcaseItem')
        ->where('action', 'reordered')
        ->where('actor_id', $this->admin->id)->count())->toBe(3);
});

test('reorder rejects an unknown showcase item id', function () {
    $item = ReviewShowcaseItem::factory()->create();

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/review-showcase/reorder', [
            'ordered_ids' => [$item->id, 99999],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['ordered_ids.1']);
});

test('admin can delete a showcase item', function () {
    $item = ReviewShowcaseItem::factory()->create();
    $id = $item->id;

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/review-showcase/{$id}")
        ->assertOk()
        ->assertJson(['message' => 'Review showcase item deleted.']);

    $this->assertDatabaseMissing('review_showcase_items', ['id' => $id]);

    expect(AuditLog::where([
        ['entity', 'ReviewShowcaseItem'],
        ['entity_id', $id],
        ['action', 'deleted'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});
