<?php

use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\Category;
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

// ─── Authorization (categories) ──────────────────────────────────────────────

test('guest gets 401 on every admin category endpoint', function () {
    $category = Category::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/categories', []],
        ['postJson', '/api/v1/admin/categories', ['name' => 'X']],
        ['getJson', "/api/v1/admin/categories/{$category->id}"],
        ['putJson', "/api/v1/admin/categories/{$category->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/categories/{$category->id}"],
        ['postJson', "/api/v1/admin/categories/{$category->id}/publish"],
        ['postJson', "/api/v1/admin/categories/{$category->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->{$method}($uri)->assertStatus(401);
    }
});

test('customer gets 403 on every admin category endpoint', function () {
    $category = Category::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/categories', []],
        ['postJson', '/api/v1/admin/categories', ['name' => 'X']],
        ['getJson', "/api/v1/admin/categories/{$category->id}"],
        ['putJson', "/api/v1/admin/categories/{$category->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/categories/{$category->id}"],
        ['postJson', "/api/v1/admin/categories/{$category->id}/publish"],
        ['postJson', "/api/v1/admin/categories/{$category->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->actingAs($this->customer)->{$method}($uri, $payload ?? [])->assertStatus(403);
    }
});

// ─── Category CRUD happy paths ───────────────────────────────────────────────

test('admin can list categories with pagination envelope', function () {
    Category::factory()->count(3)->create();

    $response = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/categories');

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

test('admin can filter categories by search and status', function () {
    Category::factory()->create(['name' => 'Laptops', 'slug' => 'laptops']);
    Category::factory()->create(['name' => 'Monitors', 'slug' => 'monitors', 'is_published' => true]);

    $searched = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/categories?search=laptop');

    expect($searched->json('total'))->toBe(1)
        ->and($searched->json('data.0.slug'))->toBe('laptops');

    $publishedOnly = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/categories?status=published');

    expect($publishedOnly->json('total'))->toBe(1)
        ->and($publishedOnly->json('data.0.slug'))->toBe('monitors');
});

test('admin can create a category with auto-generated slug', function () {
    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/categories', [
            'name' => 'Gaming Laptops',
            'description' => 'High performance machines',
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('category.name', 'Gaming Laptops')
        ->assertJsonPath('category.slug', 'gaming-laptops')
        ->assertJsonPath('category.is_published', false);

    $this->assertDatabaseHas('categories', [
        'name' => 'Gaming Laptops',
        'slug' => 'gaming-laptops',
        'is_published' => false,
    ]);

    expect(AuditLog::where([
        ['entity', 'Category'],
        ['action', 'created'],
    ])->where('entity_id', Category::where('slug', 'gaming-laptops')->value('id'))
        ->where('actor_id', $this->admin->id)
        ->exists())->toBeTrue();
});

test('admin can create a category with an explicit slug and parent', function () {
    $parent = Category::factory()->create();

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/categories', [
            'name' => 'Ultrabooks',
            'slug' => 'ultra-books',
            'parent_category_id' => $parent->id,
            'display_order' => 5,
        ]);

    $response->assertStatus(201)
        ->assertJsonPath('category.slug', 'ultra-books')
        ->assertJsonPath('category.parent_category_id', $parent->id);
});

test('creating a category with an explicit colliding slug returns 422 with message', function () {
    Category::factory()->create(['slug' => 'taken']);

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/categories', [
            'name' => 'Other Thing',
            'slug' => 'taken',
        ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'The slug "taken" is already in use by another category.');
});

test('category creation fails validation without a name', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/categories', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

test('category creation rejects invalid slug format', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/categories', [
            'name' => 'Bad Slug',
            'slug' => 'Not A Slug!',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['slug']);
});

test('admin can view a single category by id', function () {
    $category = Category::factory()->create(['name' => 'Visible One']);

    $this->actingAs($this->admin)
        ->getJson("/api/v1/admin/categories/{$category->id}")
        ->assertOk()
        ->assertJsonPath('category.id', $category->id)
        ->assertJsonPath('category.name', 'Visible One');
});

test('admin can update a category', function () {
    $category = Category::factory()->create(['name' => 'Before']);

    $response = $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/categories/{$category->id}", [
            'name' => 'After',
            'description' => 'New description',
        ]);

    $response->assertOk()
        ->assertJsonPath('category.name', 'After')
        ->assertJsonPath('category.description', 'New description');

    // Slug regenerated from new name since none was supplied.
    expect($category->refresh()->slug)->toBe('after');

    expect(AuditLog::where([
        ['entity', 'Category'],
        ['entity_id', $category->id],
        ['action', 'updated'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

test('updating a category ignores is_published tampering via HTTP', function () {
    $category = Category::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/categories/{$category->id}", [
            'is_published' => true,
        ]);

    // Publication changes must only happen through the audit-logged
    // publish/unpublish endpoints.
    expect($category->refresh()->is_published)->toBeFalse()
        ->and(AuditLog::where('entity_id', $category->id)->count())->toBe(0);
});

test('hierarchy violation surfaces as a 422 through HTTP', function () {
    $levelOne = Category::factory()->create();
    $levelTwo = Category::factory()->create(['parent_category_id' => $levelOne->id]);

    $response = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/categories', [
            'name' => 'Level Three',
            'parent_category_id' => $levelTwo->id,
        ]);

    $response->assertStatus(422)
        ->assertJsonPath(
            'message',
            'A subcategory cannot contain further subcategories. Maximum depth is 2 levels.',
        );
});

test('cycle violation surfaces as a 422 through HTTP', function () {
    $levelOne = Category::factory()->create();
    Category::factory()->create(['parent_category_id' => $levelOne->id]);

    // Self-parenting a root category: passes the depth guard (the parent is
    // itself a root) and must be rejected by the cycle guard instead.
    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/categories/{$levelOne->id}", [
            'parent_category_id' => $levelOne->id,
        ])
        ->assertStatus(422)
        ->assertJsonPath(
            'message',
            'A category cannot be moved under itself or one of its own subcategories.',
        );
});

test('admin can publish and unpublish a category with audits', function () {
    $category = Category::factory()->create(['is_published' => false]);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/categories/{$category->id}/publish")
        ->assertOk()
        ->assertJsonPath('category.is_published', true);

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/categories/{$category->id}/unpublish")
        ->assertOk()
        ->assertJsonPath('category.is_published', false);

    expect(AuditLog::where([
        ['entity', 'Category'],
        ['entity_id', $category->id],
        ['action', 'published'],
    ])->exists())->toBeTrue()
        ->and(AuditLog::where([
            ['entity', 'Category'],
            ['entity_id', $category->id],
            ['action', 'unpublished'],
        ])->exists())->toBeTrue();
});

test('admin can delete a category', function () {
    $category = Category::factory()->create();

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/categories/{$category->id}")
        ->assertOk()
        ->assertJson(['message' => 'Category deleted.']);

    $this->assertDatabaseMissing('categories', ['id' => $category->id]);

    expect(AuditLog::where([
        ['entity', 'Category'],
        ['entity_id', $category->id],
        ['action', 'deleted'],
        ['actor_id', $this->admin->id],
    ])->exists())->toBeTrue();
});

// ─── Brand authorization + CRUD ──────────────────────────────────────────────

test('guest gets 401 on every admin brand endpoint', function () {
    $brand = Brand::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/brands', []],
        ['postJson', '/api/v1/admin/brands', ['name' => 'X']],
        ['getJson', "/api/v1/admin/brands/{$brand->id}"],
        ['putJson', "/api/v1/admin/brands/{$brand->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/brands/{$brand->id}"],
        ['postJson', "/api/v1/admin/brands/{$brand->id}/publish"],
        ['postJson', "/api/v1/admin/brands/{$brand->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->{$method}($uri)->assertStatus(401);
    }
});

test('customer gets 403 on every admin brand endpoint', function () {
    $brand = Brand::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/brands', []],
        ['postJson', '/api/v1/admin/brands', ['name' => 'X']],
        ['getJson', "/api/v1/admin/brands/{$brand->id}"],
        ['putJson', "/api/v1/admin/brands/{$brand->id}", ['name' => 'X']],
        ['deleteJson', "/api/v1/admin/brands/{$brand->id}"],
        ['postJson', "/api/v1/admin/brands/{$brand->id}/publish"],
        ['postJson', "/api/v1/admin/brands/{$brand->id}/unpublish"],
    ];

    foreach ($endpoints as [$method, $uri]) {
        $this->actingAs($this->customer)->{$method}($uri, $payload ?? [])->assertStatus(403);
    }
});

test('admin can create, update, publish and delete a brand over HTTP', function () {
    $created = $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/brands', ['name' => 'TechBrand'])
        ->assertStatus(201)
        ->assertJsonPath('brand.name', 'TechBrand')
        ->assertJsonPath('brand.slug', 'techbrand');

    $brandId = $created->json('brand.id');

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/brands/{$brandId}", ['name' => 'Renamed Brand'])
        ->assertOk()
        ->assertJsonPath('brand.name', 'Renamed Brand');

    $this->actingAs($this->admin)
        ->postJson("/api/v1/admin/brands/{$brandId}/publish")
        ->assertOk()
        ->assertJsonPath('brand.is_published', true);

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/brands/{$brandId}")
        ->assertOk()
        ->assertJson(['message' => 'Brand deleted.']);

    $this->assertDatabaseMissing('brands', ['id' => $brandId]);

    expect(AuditLog::where('entity', 'Brand')->whereIn('action', ['created', 'updated', 'published', 'deleted'])
        ->where('actor_id', $this->admin->id)->count())->toBe(4);
});
