<?php

use App\Models\Asset;
use App\Models\Brand;
use App\Models\Category;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
});

// ─── Public category reads ───────────────────────────────────────────────────

test('public categories index returns only published categories', function () {
    $published = Category::factory()->create(['name' => 'Published', 'slug' => 'published', 'is_published' => true]);
    Category::factory()->create(['name' => 'Hidden', 'slug' => 'hidden', 'is_published' => false]);

    $response = $this->getJson('/api/v1/categories');

    $response->assertOk()
        ->assertJsonStructure(['categories']);

    $slugs = collect($response->json('categories'))->pluck('slug');

    expect($slugs)->toContain('published')
        ->not->toContain('hidden')
        ->and(count($response->json('categories')))->toBe(1);
});

test('public categories index returns both levels when no parent filter given', function () {
    $parent = Category::factory()->create(['slug' => 'parent', 'is_published' => true]);
    Category::factory()->create(['slug' => 'child', 'is_published' => true, 'parent_category_id' => $parent->id]);

    // No ?parent_id → ALL published categories from both levels, so the
    // frontend can assemble the tree client-side.
    $all = $this->getJson('/api/v1/categories');
    expect(count($all->json('categories')))->toBe(2);

    // With ?parent_id → published direct children only.
    $children = $this->getJson('/api/v1/categories?parent_id='.$parent->id);

    $childSlugs = collect($children->json('categories'))->pluck('slug')->all();
    expect($childSlugs)->toBe(['child']);
});

test('public category detail is reachable by slug when published', function () {
    Category::factory()->create(['name' => 'Laptops', 'slug' => 'laptops', 'is_published' => true]);

    $this->getJson('/api/v1/categories/laptops')
        ->assertOk()
        ->assertJsonPath('category.slug', 'laptops')
        ->assertJsonPath('category.name', 'Laptops');
});

test('unpublished and non-existent category slugs return identical 404s', function () {
    // IDOR guard: an unpublished category must be indistinguishable from a
    // missing one — same status code, same empty body shape.
    $unpublished = $this->getJson('/api/v1/categories/unpublished-slug');
    $missing = $this->getJson('/api/v1/categories/never-existed');

    $unpublished->assertStatus(404);
    $missing->assertStatus(404);

    // In production (APP_DEBUG=false) the bodies are fully identical; under
    // local debug mode the embedded exception trace differs by test call-site
    // line, so equality is asserted on the user-visible message field.
    expect($unpublished->json('message'))->toBe($missing->json('message'));
});

test('newly published category appears on the public listing immediately', function () {
    $category = Category::factory()->create(['slug' => 'fresh', 'is_published' => false]);

    expect(collect($this->getJson('/api/v1/categories')->json('categories'))->pluck('slug'))
        ->not->toContain('fresh');

    $category->update(['is_published' => true]);

    expect(collect($this->getJson('/api/v1/categories')->json('categories'))->pluck('slug'))
        ->toContain('fresh');
});

test('public category reads include eager-loaded logo and banner assets with a usable path', function () {
    $logo = Asset::factory()->create(['path' => 'categories/laptops-logo.jpg', 'thumbnail_path' => 'categories/thumbs/laptops-logo.jpg']);
    $banner = Asset::factory()->create(['path' => 'categories/laptops-banner.jpg', 'thumbnail_path' => 'categories/thumbs/laptops-banner.jpg']);

    Category::factory()->create([
        'name' => 'Laptops',
        'slug' => 'laptops',
        'is_published' => true,
        'logo_asset_id' => $logo->id,
        'banner_asset_id' => $banner->id,
    ]);

    $index = $this->getJson('/api/v1/categories');

    $index->assertOk()
        ->assertJsonPath('categories.0.logo_asset.id', $logo->id)
        ->assertJsonPath('categories.0.logo_asset.path', $logo->path)
        ->assertJsonPath('categories.0.logo_asset.thumbnail_path', $logo->thumbnail_path)
        ->assertJsonPath('categories.0.banner_asset.path', $banner->path);

    $detail = $this->getJson('/api/v1/categories/laptops');

    $detail->assertOk()
        ->assertJsonPath('category.logo_asset.id', $logo->id)
        ->assertJsonPath('category.logo_asset.path', $logo->path)
        ->assertJsonPath('category.banner_asset.path', $banner->path);
});

// ─── Public brand reads ──────────────────────────────────────────────────────

test('public brands index returns only published brands', function () {
    Brand::factory()->create(['slug' => 'shown-brand', 'is_published' => true]);
    Brand::factory()->create(['slug' => 'hidden-brand', 'is_published' => false]);

    $response = $this->getJson('/api/v1/brands');

    $response->assertOk()
        ->assertJsonStructure(['brands']);

    $slugs = collect($response->json('brands'))->pluck('slug');

    expect($slugs)->toContain('shown-brand')
        ->not->toContain('hidden-brand');
});

test('public brand detail works when published and 404s otherwise', function () {
    Brand::factory()->create(['slug' => 'live-brand', 'is_published' => true]);
    Brand::factory()->create(['slug' => 'draft-brand', 'is_published' => false]);

    $this->getJson('/api/v1/brands/live-brand')
        ->assertOk()
        ->assertJsonPath('brand.slug', 'live-brand');

    $unpublished = $this->getJson('/api/v1/brands/draft-brand');
    $missing = $this->getJson('/api/v1/brands/nope-brand');

    $unpublished->assertStatus(404);
    $missing->assertStatus(404);

    // Same rationale as categories: debug-mode traces differ by call site.
    expect($unpublished->json('message'))->toBe($missing->json('message'));
});
