<?php

use App\Models\Service;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
});

// ─── Public listing ──────────────────────────────────────────────────────────

test('public services index returns only published services', function () {
    Service::factory()->create(['name' => 'Published Service', 'slug' => 'published-service', 'is_published' => true]);
    Service::factory()->create(['name' => 'Hidden Service', 'slug' => 'hidden-service', 'is_published' => false]);

    $response = $this->getJson('/api/v1/services');

    // Paginated envelope (paginator->toArray()), not a bare collection key.
    $response->assertOk()
        ->assertJsonStructure([
            'data',
            'links',
            'current_page',
            'total',
            'per_page',
        ]);

    $slugs = collect($response->json('data'))->pluck('slug');

    expect($slugs)->toContain('published-service')
        ->not->toContain('hidden-service')
        ->and($response->json('total'))->toBe(1);
});

test('public services index paginates', function () {
    Service::factory()->count(3)->create(['is_published' => true]);

    $page = $this->getJson('/api/v1/services?per_page=2');

    $page->assertOk()
        ->assertJsonStructure(['data', 'links', 'current_page', 'total', 'per_page']);

    expect($page->json('data'))->toHaveCount(2)
        ->and($page->json('total'))->toBe(3);

    $second = $this->getJson('/api/v1/services?per_page=2&page=2');

    expect($second->json('data'))->toHaveCount(1);
});

// ─── Public detail ───────────────────────────────────────────────────────────

test('public service detail is reachable by slug when published', function () {
    Service::factory()->create([
        'name' => 'SSD Upgrade',
        'slug' => 'ssd-upgrade',
        'is_published' => true,
        'price_min' => 1500,
        'price_max' => 4500,
    ]);

    $this->getJson('/api/v1/services/ssd-upgrade')
        ->assertOk()
        ->assertJsonPath('service.slug', 'ssd-upgrade')
        ->assertJsonPath('service.name', 'SSD Upgrade');
});

test('unpublished and non-existent service slugs return byte-identical 404s', function () {
    // IDOR guard: an unpublished service must be indistinguishable from a
    // missing one. The shared NotFoundHttpException render in bootstrap/app.php
    // returns the exact body {"message":"Not Found"} for every missing resource,
    // so the two responses are byte-identical — not merely both 404.
    Service::factory()->create(['slug' => 'draft-service', 'is_published' => false]);

    $unpublished = $this->getJson('/api/v1/services/draft-service');
    $missing = $this->getJson('/api/v1/services/never-existed');

    $unpublished->assertStatus(404);
    $missing->assertStatus(404);

    expect($unpublished->getContent())->toBe($missing->getContent());
    $this->assertSame('{"message":"Not Found"}', $unpublished->getContent());
});

test('newly published service appears on the public listing immediately', function () {
    $service = Service::factory()->create(['slug' => 'fresh', 'is_published' => false]);

    expect(collect($this->getJson('/api/v1/services')->json('data'))->pluck('slug'))
        ->not->toContain('fresh');

    $service->update(['is_published' => true]);

    expect(collect($this->getJson('/api/v1/services')->json('data'))->pluck('slug'))
        ->toContain('fresh');
});
