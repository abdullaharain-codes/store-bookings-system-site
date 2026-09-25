<?php

use App\Shared\FileUploadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('uploads');
    $this->service = new FileUploadService;
});

test('store creates full image and thumbnail with correct dimensions', function () {
    $file = UploadedFile::fake()->image('test-product.jpg', 800, 600, 'jpg');

    $asset = $this->service->store($file, 'products');

    // Asset record created with both paths
    expect($asset->path)->toContain('.jpg');
    expect($asset->thumbnail_path)->not->toBeNull();
    expect($asset->thumbnail_path)->toContain('-thumb.jpg');
    expect($asset->disk)->toBe('uploads');

    // Both files exist on the uploads disk
    Storage::disk('uploads')->assertExists($asset->path);
    Storage::disk('uploads')->assertExists($asset->thumbnail_path);

    // Thumbnail is smaller in dimensions than the full image
    $fullDims = getimagesize(Storage::disk('uploads')->path($asset->path));
    $thumbDims = getimagesize(Storage::disk('uploads')->path($asset->thumbnail_path));

    expect($thumbDims[0])->toBeLessThanOrEqual(400);
    expect($thumbDims[1])->toBeLessThanOrEqual(400);
    expect($thumbDims[0])->toBeLessThan($fullDims[0]);
    expect($thumbDims[1])->toBeLessThan($fullDims[1]);
});

test('store generates thumbnail within max dimensions', function () {
    $file = UploadedFile::fake()->image('wide-banner.jpg', 1600, 400, 'jpg');

    $asset = $this->service->store($file, 'homepage');

    Storage::disk('uploads')->assertExists($asset->path);
    Storage::disk('uploads')->assertExists($asset->thumbnail_path);

    $fullDims = getimagesize(Storage::disk('uploads')->path($asset->path));
    $thumbDims = getimagesize(Storage::disk('uploads')->path($asset->thumbnail_path));

    expect($thumbDims[0])->toBeLessThanOrEqual(400);
    expect($thumbDims[1])->toBeLessThanOrEqual(400);

    // Thumbnail must preserve the source aspect ratio. The expected ratio is
    // computed from the actual decoded full-image dimensions (not the requested
    // fake dimensions), within a small tolerance for integer pixel rounding.
    $fullRatio = $fullDims[0] / $fullDims[1];
    $thumbRatio = $thumbDims[0] / $thumbDims[1];

    expect(abs($fullRatio - $thumbRatio))->toBeLessThanOrEqual(0.05);
});

test('delete removes both full and thumbnail files', function () {
    $file = UploadedFile::fake()->image('to-delete.png', 600, 400, 'png');

    $asset = $this->service->store($file, 'brands');

    Storage::disk('uploads')->assertExists($asset->path);
    Storage::disk('uploads')->assertExists($asset->thumbnail_path);

    $this->service->delete($asset);

    Storage::disk('uploads')->assertMissing($asset->path);
    Storage::disk('uploads')->assertMissing($asset->thumbnail_path);
    $this->assertDatabaseMissing('assets', ['id' => $asset->id]);
});

test('asset model exposes thumbnail url accessor', function () {
    $file = UploadedFile::fake()->image('accessor-test.jpg', 500, 500, 'jpg');

    $asset = $this->service->store($file, 'categories');

    expect($asset->thumbnail_url)->not->toBeNull();
    expect($asset->thumbnail_url)->toContain($asset->thumbnail_path);
    expect($asset->thumbnail_url)->toContain('/storage/uploads/');
});

// ─── SRS §3.4 dimension limits, derived from category ─────────────────────────

test('a category accepts an image exactly at its maximum dimensions', function (string $category, int $width, int $height) {
    $file = UploadedFile::fake()->image('at-limit.jpg', $width, $height, 'jpg');

    $asset = $this->service->store($file, $category);

    expect($asset->path)->not->toBeNull()
        ->and($asset->width)->toBe($width)
        ->and($asset->height)->toBe($height);
    Storage::disk('uploads')->assertExists($asset->path);
})->with([
    'brands (logo 1024x1024)' => ['brands', 1024, 1024],
    'categories (logo 1024x1024)' => ['categories', 1024, 1024],
    'categories/banners (banner 2400x1200)' => ['categories/banners', 2400, 1200],
    'homepage (banner 2400x1200)' => ['homepage', 2400, 1200],
    'products (product 2000x2000)' => ['products', 2000, 2000],
    'review-showcase (product 2000x2000)' => ['review-showcase', 2000, 2000],
    'booking-attachments (product 2000x2000)' => ['booking-attachments', 2000, 2000],
]);

test('a category rejects an image one pixel over either max dimension, never silently resizing', function (string $category, int $width, int $height) {
    $file = UploadedFile::fake()->image('over-limit.jpg', $width, $height, 'jpg');

    expect(fn () => $this->service->store($file, $category))
        ->toThrow(InvalidArgumentException::class, 'exceed maximum');

    $this->assertDatabaseCount('assets', 0);
})->with([
    'brands width +1' => ['brands', 1025, 1024],
    'brands height +1' => ['brands', 1024, 1025],
    'categories width +1' => ['categories', 1025, 1024],
    'categories/banners width +1' => ['categories/banners', 2401, 1200],
    'categories/banners height +1' => ['categories/banners', 2400, 1201],
    'homepage width +1' => ['homepage', 2401, 1200],
    'products width +1' => ['products', 2001, 2000],
    'products height +1' => ['products', 2000, 2001],
    'review-showcase width +1' => ['review-showcase', 2001, 2000],
    'booking-attachments width +1' => ['booking-attachments', 2001, 2000],
]);
