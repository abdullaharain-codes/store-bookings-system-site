<?php

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\Service;
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

// ─── Authorization ───────────────────────────────────────────────────────────

test('guest gets 401 on every admin service endpoint', function () {
    $service = Service::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/services', []],
        ['postJson', '/api/v1/admin/services', [
            'name' => 'X',
            'price_min' => 1000,
            'price_max' => 2000,
            'duration_minutes' => 60,
        ]],
        ['getJson', "/api/v1/admin/services/{$service->id}"],
        ['putJson', "/api/v1/admin/services/{$service->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/services/{$service->id}"],
        ['postJson', "/api/v1/admin/services/{$service->id}/publish"],
        ['postJson', "/api/v1/admin/services/{$service->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->{$method}($uri)->assertStatus(401);
    }
});

test('customer gets 403 on every admin service endpoint', function () {
    $service = Service::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/services', []],
        ['postJson', '/api/v1/admin/services', [
            'name' => 'X',
            'price_min' => 1000,
            'price_max' => 2000,
            'duration_minutes' => 60,
        ]],
        ['getJson', "/api/v1/admin/services/{$service->id}"],
        ['putJson', "/api/v1/admin/services/{$service->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/services/{$service->id}"],
        ['postJson', "/api/v1/admin/services/{$service->id}/publish"],
        ['postJson', "/api/v1/admin/services/{$service->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->actingAs($this->customer)->{$method}($uri, $payload ?? [])->assertStatus(403);
    }
});

// ─── Listing ─────────────────────────────────────────────────────────────────

test('admin can list services with pagination envelope, including unpublished', function () {
    Service::factory()->count(3)->create();

    $response = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/services');

    // Standard Laravel paginator shape — the frontend reads .data + meta.
    $response->assertOk()
        ->assertJsonStructure([
            'data',
            'links',
            'current_page',
            'total',
            'per_page',
        ]);

    expect($response->json('total'))->toBe(3);
});

test('admin can filter services by search and status', function () {
    Service::factory()->create(['name' => 'Virus Removal', 'slug' => 'virus-removal', 'is_published' => false]);
    Service::factory()->create(['name' => 'Data Recovery', 'slug' => 'data-recovery', 'is_published' => true]);

    $searched = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/services?search=recovery');

    expect($searched->json('total'))->toBe(1)
        ->and($searched->json('data.0.slug'))->toBe('data-recovery');

    $publishedOnly = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/services?status=published');

    expect($publishedOnly->json('total'))->toBe(1)
        ->and($publishedOnly->json('data.0.slug'))->toBe('data-recovery');

    $unpublishedOnly = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/services?status=unpublished');

    expect($unpublishedOnly->json('total'))->toBe(1)
        ->and($unpublishedOnly->json('data.0.slug'))->toBe('virus-removal');
});

// ─── Create ──────────────────────────────────────────────────────────────────

test('admin can create a service with auto-generated slug', function () {
    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/services', [
            'name' => 'Laptop Screen Repair',
            'description' => 'Full panel replacement.',
            'price_min' => '2000',
            'price_max' => '8000',
            'duration_minutes' => 90,
            'is_published' => false,
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('service.name', 'Laptop Screen Repair')
        ->assertJsonPath('service.slug', 'laptop-screen-repair')
        ->assertJsonPath('service.is_published', false)
        ->assertJsonPath('service.price_min', '2000.00')
        ->assertJsonPath('service.price_max', '8000.00')
        ->assertJsonPath('service.duration_minutes', 90);

    $this->assertDatabaseHas('services', [
        'name' => 'Laptop Screen Repair',
        'slug' => 'laptop-screen-repair',
        'is_published' => false,
    ]);

    expect(AuditLog::where([
        ['entity', 'Service'],
        ['action', 'created'],
    ])->where('entity_id', Service::where('slug', 'laptop-screen-repair')->value('id'))
        ->where('actor_id', $this->admin->id)
        ->exists())->toBeTrue();
});

test('creating a service with an explicit colliding slug returns 422 with message', function () {
    Service::factory()->create(['slug' => 'taken']);

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/services', [
            'name' => 'Other Thing',
            'slug' => 'taken',
            'price_min' => 1000,
            'price_max' => 2000,
            'duration_minutes' => 60,
        ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'The slug "taken" is already in use by another service.');
});

test('price_min greater than price_max is rejected via HTTP with 422', function () {
    // phases.md Phase 6 criterion — enforced at the request boundary.
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/services', [
            'name' => 'Bad Range',
            'price_min' => '9000',
            'price_max' => '1000',
            'duration_minutes' => 60,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['price_min']);
});

test('service creation fails validation without required fields', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/services', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'price_min', 'price_max', 'duration_minutes']);
});

// ─── Read + Update ───────────────────────────────────────────────────────────

test('admin can view an unpublished service by id', function () {
    $service = Service::factory()->create(['name' => 'Draft Only', 'is_published' => false]);

    $this->actingAs($this->admin)
        ->getJson("/api/v1/admin/services/{$service->id}")
        ->assertOk()
        ->assertJsonPath('service.id', $service->id)
        ->assertJsonPath('service.is_published', false);
});

test('admin can update a service', function () {
    $service = Service::factory()->create(['name' => 'Before']);

    $response = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/services/{$service->id}", [
            'name' => 'After',
            'duration_minutes' => 45,
        ]);

    $response->assertOk()
        ->assertJsonPath('service.name', 'After')
        ->assertJsonPath('service.duration_minutes', 45);

    // Slug regenerated from new name since none was supplied.
    expect($service->refresh()->slug)->toBe('after');

    expect(AuditLog::where([
        ['entity', 'Service'],
        ['entity_id', $service->id],
        ['action', 'updated'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

test('update rejects raising price_min above the stored price_max with 422', function () {
    $service = Service::factory()->create(['price_min' => 1000, 'price_max' => 4000]);

    // A lone price_min escapes the request boundary (nothing to compare it
    // against) and is caught by the service layer's effective-range check.
    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/services/{$service->id}", ['price_min' => 5000])
        ->assertStatus(422)
        ->assertJsonPath(
            'message',
            'The price_min must be less than or equal to price_max for a service.',
        );
});

test('updating a service ignores is_published tampering via HTTP', function () {
    $service = Service::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/services/{$service->id}", [
            'is_published' => true,
        ]);

    // Publication changes must only happen through the audit-logged
    // publish/unpublish endpoints.
    expect($service->refresh()->is_published)->toBeFalse()
        ->and(AuditLog::where('entity_id', $service->id)->count())->toBe(0);
});

// ─── Publish + Delete ────────────────────────────────────────────────────────

test('admin can publish and unpublish a service with audits', function () {
    $service = Service::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/services/{$service->id}/publish")
        ->assertOk()
        ->assertJsonPath('service.is_published', true);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/services/{$service->id}/unpublish")
        ->assertOk()
        ->assertJsonPath('service.is_published', false);

    expect(AuditLog::where([
        ['entity', 'Service'],
        ['entity_id', $service->id],
        ['action', 'published'],
    ])->exists())->toBeTrue()
        ->and(AuditLog::where([
            ['entity', 'Service'],
            ['entity_id', $service->id],
            ['action', 'unpublished'],
        ])->exists())->toBeTrue();
});

test('admin can delete a service', function () {
    $service = Service::factory()->create();

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/services/{$service->id}")
        ->assertOk()
        ->assertJson(['message' => 'Service deleted.']);

    $this->assertDatabaseMissing('services', ['id' => $service->id]);

    expect(AuditLog::where([
        ['entity', 'Service'],
        ['entity_id', $service->id],
        ['action', 'deleted'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});
