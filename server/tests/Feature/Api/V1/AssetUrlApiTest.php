<?php

use App\Models\Asset;
use App\Models\Brand;
use App\Models\Category;
use App\Models\HomepageBanner;
use App\Models\Product;
use App\Models\ReviewShowcaseItem;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
});

function uploadsUrl(string $path): string
{
    return config('filesystems.disks.uploads.url').'/'.$path;
}

test('public product list images expose a usable asset url and thumbnail url', function () {
    $asset = Asset::factory()->create([
        'path' => 'products/prod-1.jpg',
        'thumbnail_path' => 'products/prod-1-thumb.jpg',
    ]);

    $product = Product::factory()->published()->create();
    $product->images()->create(['asset_id' => $asset->id, 'display_order' => 0]);

    $this->getJson('/api/v1/products')
        ->assertOk()
        ->assertJsonPath('data.0.images.0.asset.url', uploadsUrl('products/prod-1.jpg'))
        ->assertJsonPath('data.0.images.0.asset.thumbnail_url', uploadsUrl('products/prod-1-thumb.jpg'));
});

test('public product detail images expose url and thumbnail_url', function () {
    $asset = Asset::factory()->create([
        'path' => 'products/prod-2.jpg',
        'thumbnail_path' => 'products/prod-2-thumb.jpg',
    ]);

    $product = Product::factory()->published()->create();
    $product->images()->create(['asset_id' => $asset->id, 'display_order' => 0]);

    $this->getJson("/api/v1/products/{$product->slug}")
        ->assertOk()
        ->assertJsonPath('product.images.0.asset.url', uploadsUrl('products/prod-2.jpg'))
        ->assertJsonPath('product.images.0.asset.thumbnail_url', uploadsUrl('products/prod-2-thumb.jpg'))
        ->assertJsonPath('product.images.0.asset.path', 'products/prod-2.jpg')
        ->assertJsonPath('product.images.0.asset.thumbnail_path', 'products/prod-2-thumb.jpg');
});

test('homepage banner asset exposes url and thumbnail_url', function () {
    $asset = Asset::factory()->create([
        'path' => 'homepage/banner-1.jpg',
        'thumbnail_path' => 'homepage/banner-1-thumb.jpg',
    ]);
    HomepageBanner::factory()->published()->create([
        'asset_id' => $asset->id,
        'target_category_id' => Category::factory()->create(['is_published' => true])->id,
    ]);

    $this->getJson('/api/v1/homepage-banners')
        ->assertOk()
        ->assertJsonPath('banners.0.asset.url', uploadsUrl('homepage/banner-1.jpg'))
        ->assertJsonPath('banners.0.asset.thumbnail_url', uploadsUrl('homepage/banner-1-thumb.jpg'));
});

test('review showcase asset exposes url and thumbnail_url', function () {
    $asset = Asset::factory()->create([
        'path' => 'review-showcase/rev-1.jpg',
        'thumbnail_path' => 'review-showcase/rev-1-thumb.jpg',
    ]);
    ReviewShowcaseItem::factory()->published()->create(['asset_id' => $asset->id]);

    $this->getJson('/api/v1/review-showcase')
        ->assertOk()
        ->assertJsonPath('review_showcase_items.data.0.asset.url', uploadsUrl('review-showcase/rev-1.jpg'))
        ->assertJsonPath('review_showcase_items.data.0.asset.thumbnail_url', uploadsUrl('review-showcase/rev-1-thumb.jpg'));
});

test('category logo and banner assets expose url and thumbnail_url', function () {
    $logo = Asset::factory()->create([
        'path' => 'categories/cat-logo.jpg',
        'thumbnail_path' => 'categories/cat-logo-thumb.jpg',
    ]);
    $banner = Asset::factory()->create([
        'path' => 'categories/banners/cat-banner.jpg',
        'thumbnail_path' => null,
    ]);
    Category::factory()->create([
        'slug' => 'laptops',
        'is_published' => true,
        'logo_asset_id' => $logo->id,
        'banner_asset_id' => $banner->id,
    ]);

    $this->getJson('/api/v1/categories')
        ->assertOk()
        ->assertJsonPath('categories.0.logo_asset.url', uploadsUrl('categories/cat-logo.jpg'))
        ->assertJsonPath('categories.0.logo_asset.thumbnail_url', uploadsUrl('categories/cat-logo-thumb.jpg'))
        ->assertJsonPath('categories.0.banner_asset.url', uploadsUrl('categories/banners/cat-banner.jpg'))
        ->assertJsonPath('categories.0.banner_asset.thumbnail_url', null);

    $this->getJson('/api/v1/categories/laptops')
        ->assertOk()
        ->assertJsonPath('category.logo_asset.url', uploadsUrl('categories/cat-logo.jpg'))
        ->assertJsonPath('category.banner_asset.url', uploadsUrl('categories/banners/cat-banner.jpg'))
        ->assertJsonPath('category.banner_asset.thumbnail_url', null);
});

test('brand logo asset exposes url and thumbnail_url', function () {
    $logo = Asset::factory()->create([
        'path' => 'brands/acme-logo.jpg',
        'thumbnail_path' => 'brands/acme-logo-thumb.jpg',
    ]);
    Brand::factory()->create([
        'slug' => 'acme',
        'is_published' => true,
        'logo_asset_id' => $logo->id,
    ]);

    $this->getJson('/api/v1/brands')
        ->assertOk()
        ->assertJsonPath('brands.0.logo_asset.url', uploadsUrl('brands/acme-logo.jpg'))
        ->assertJsonPath('brands.0.logo_asset.thumbnail_url', uploadsUrl('brands/acme-logo-thumb.jpg'));

    $this->getJson('/api/v1/brands/acme')
        ->assertOk()
        ->assertJsonPath('brand.logo_asset.url', uploadsUrl('brands/acme-logo.jpg'))
        ->assertJsonPath('brand.logo_asset.thumbnail_url', uploadsUrl('brands/acme-logo-thumb.jpg'));
});

test('an asset url is derived from the uploads disk config and never hard-coded', function () {
    $asset = Asset::factory()->create([
        'path' => 'products/prod-3.jpg',
        'thumbnail_path' => null,
    ]);

    expect($asset->url)->toBe(uploadsUrl($asset->path))
        ->and($asset->thumbnail_url)->toBeNull();
});
