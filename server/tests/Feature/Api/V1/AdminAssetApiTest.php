<?php

use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    Storage::fake('uploads');

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Authorization ────────────────────────────────────────────────────────────

test('guest gets 401 on the asset upload endpoint', function () {
    $this->post('/api/v1/admin/assets', [])->assertStatus(401);
});

test('customer gets 403 on the asset upload endpoint', function () {
    $this->actingAs($this->customer)
        ->post('/api/v1/admin/assets', [])
        ->assertStatus(403);
});

// ─── Successful uploads (one per supported category) ─────────────────────────

test('admin uploads a valid image to each supported category', function (string $category) {
    $response = $this->actingAs($this->admin)->post('/api/v1/admin/assets', [
        'category' => $category,
        'file' => UploadedFile::fake()->image('photo.jpg', 800, 600, 'jpg'),
    ]);

    $response->assertStatus(201);

    $asset = Asset::query()->latest('id')->first();

    expect($asset)->not->toBeNull()
        ->and($asset->disk)->toBe('uploads')
        ->and($asset->path)->toContain($category.'/')
        ->and($asset->thumbnail_path)->toContain('thumb.')
        ->and($asset->width)->toBe(800)
        ->and($asset->height)->toBe(600)
        ->and($asset->uploaded_by)->toBe($this->admin->id);

    Storage::disk('uploads')->assertExists($asset->path);
    Storage::disk('uploads')->assertExists($asset->thumbnail_path);

    $response->assertJsonPath('asset.id', $asset->id)
        ->assertJsonPath('asset.url', $asset->url)
        ->assertJsonPath('asset.thumbnail_url', $asset->thumbnail_url)
        ->assertJsonPath('asset.width', 800)
        ->assertJsonPath('asset.height', 600)
        ->assertJsonPath('asset.category', $category);
})->with([
    'products',
    'brands',
    'categories',
    'categories/banners',
    'homepage',
    'review-showcase',
    'booking-attachments',
]);

// ─── Rejections (FileUploadService validation, surfaced as 422 not 500) ───────

test('an invalid category value is rejected with 422 and stores nothing', function () {
    $this->actingAs($this->admin)
        ->post('/api/v1/admin/assets', [
            'category' => 'not-a-category',
            'file' => UploadedFile::fake()->image('photo.jpg', 100, 100, 'jpg'),
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Invalid upload category: not-a-category');

    $this->assertDatabaseCount('assets', 0);
});

test('an oversized file is rejected with 422, not 500', function () {
    $this->actingAs($this->admin)
        ->post('/api/v1/admin/assets', [
            'category' => 'products',
            'file' => UploadedFile::fake()->create('big.jpg', 3000, 'image/jpeg'),
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'File exceeds maximum size of 2 MB');

    $this->assertDatabaseCount('assets', 0);
});

test('a masked script file is rejected with 422, not 500', function () {
    $this->actingAs($this->admin)
        ->post('/api/v1/admin/assets', [
            'category' => 'products',
            'file' => UploadedFile::fake()->create('photo.jpg', 1, 'text/php'),
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'Invalid file type: text/php. Allowed: image/jpeg, image/png, image/webp');

    $this->assertDatabaseCount('assets', 0);
});

test('an oversized-dimension image is rejected with 422 by the upload endpoint', function (string $category, int $width, int $height) {
    $response = $this->actingAs($this->admin)->post('/api/v1/admin/assets', [
        'category' => $category,
        'file' => UploadedFile::fake()->image('too-big.jpg', $width, $height, 'jpg'),
    ]);

    $response->assertStatus(422);
    expect($response->json('message'))->toContain('exceed maximum');

    $this->assertDatabaseCount('assets', 0);
})->with([
    'brands over logo limit' => ['brands', 1025, 1024],
    'homepage over banner limit' => ['homepage', 2401, 1200],
    'products over product limit' => ['products', 2001, 2000],
]);

// ─── Audit trail ──────────────────────────────────────────────────────────────

test('a successful upload writes an asset audit log row with the category', function () {
    $this->actingAs($this->admin)->post('/api/v1/admin/assets', [
        'category' => 'brands',
        'file' => UploadedFile::fake()->image('logo.png', 300, 300, 'png'),
    ])->assertStatus(201);

    $asset = Asset::query()->latest('id')->first();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Asset',
        'entity_id' => $asset->id,
        'action' => 'uploaded',
        'actor_id' => $this->admin->id,
    ]);

    $log = AuditLog::where('entity', 'Asset')->where('entity_id', $asset->id)->first();

    expect($log->metadata)->toBe(['category' => 'brands']);
});
