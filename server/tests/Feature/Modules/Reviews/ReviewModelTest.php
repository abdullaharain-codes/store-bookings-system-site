<?php

use App\Models\Product;
use App\Models\Review;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('reviews table exists with the expected columns', function () {
    expect(Schema::hasTable('reviews'))->toBeTrue();

    foreach ([
        'id',
        'user_id',
        'product_id',
        'service_id',
        'rating',
        'comment',
        'verified_source',
        'source_id',
        'is_published',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('reviews', $column))->toBeTrue();
    }
});

test('publish state and the one-per-target rule carry the expected indexes', function () {
    $indexes = collect(DB::select("PRAGMA index_list('reviews')"))
        ->pluck('name');

    expect($indexes)->toContain('reviews_product_id_is_published_index');
    expect($indexes)->toContain('reviews_service_id_is_published_index');
    expect($indexes)->toContain('reviews_user_id_product_id_unique');
    expect($indexes)->toContain('reviews_user_id_service_id_unique');
});

test('foreign keys cascade with the user and null out a removed target', function () {
    $fks = collect(DB::select("PRAGMA foreign_key_list('reviews')"))
        ->keyBy('from');

    // A deleted customer's reviews go with them (user-authored content, like
    // wishlists) — deliberately NOT restrict like orders.
    expect($fks->get('user_id')->table)->toBe('users')
        ->and($fks->get('user_id')->on_delete)->toBe('CASCADE');

    // A removed product/service keeps the historical review row (the product
    // FK nulls out, mirroring order_items.product_id).
    expect($fks->get('product_id')->table)->toBe('products')
        ->and($fks->get('product_id')->on_delete)->toBe('SET NULL');

    expect($fks->get('service_id')->table)->toBe('services')
        ->and($fks->get('service_id')->on_delete)->toBe('SET NULL');
});

test('verified_source is an enforced enum of order and service_booking', function () {
    Review::factory()->create(['verified_source' => 'order']);
    Review::factory()->forService(Service::factory()->create(['is_published' => true]), 1)
        ->create(['verified_source' => 'service_booking']);

    expect(fn () => Review::factory()->create(['verified_source' => 'bogus']))
        ->toThrow(QueryException::class);
});

test('factory creates a published product review by default', function () {
    $review = Review::factory()->create();

    $this->assertDatabaseHas('reviews', ['id' => $review->id]);

    expect($review->is_published)->toBeTrue();
    expect($review->rating)->toBeBetween(1, 5);
    expect($review->verified_source)->toBe('order');
    expect($review->product_id)->not->toBeNull();
    expect($review->service_id)->toBeNull();

    expect($review->user)->not->toBeNull();
    expect($review->product)->not->toBeNull();
});

test('forService() state builds a service review', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $review = Review::factory()->forService($service, 42)->create();

    expect($review->product_id)->toBeNull();
    expect($review->service_id)->toBe($service->id);
    expect($review->verified_source)->toBe('service_booking');
    expect($review->source_id)->toBe(42);
});

test('a customer can review a given product only once (unique enforced)', function () {
    $user = User::factory()->create();
    $product = Product::factory()->published()->create(['stock_quantity' => 10]);

    Review::factory()->create(['user_id' => $user->id, 'product_id' => $product->id]);

    expect(fn () => Review::factory()->create(['user_id' => $user->id, 'product_id' => $product->id]))
        ->toThrow(QueryException::class);
});

test('a customer can review a given service only once, and products/services do not collide', function () {
    $user = User::factory()->create();
    $product = Product::factory()->published()->create(['stock_quantity' => 10]);
    $service = Service::factory()->create(['is_published' => true]);

    Review::factory()->create(['user_id' => $user->id, 'product_id' => $product->id]);
    Review::factory()->forService($service, 1)->create(['user_id' => $user->id]);

    // Same user, same service: blocked. (The user, the product review, and
    // the service review all coexist above — NULLs are distinct, so the two
    // composite uniques never fight over the same row.)
    expect(fn () => Review::factory()->forService($service, 2)->create(['user_id' => $user->id]))
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('reviews', 2);
});

test('deleting a user cascades their reviews', function () {
    $user = User::factory()->create();
    $review = Review::factory()->create(['user_id' => $user->id]);

    $user->delete();

    $this->assertDatabaseMissing('reviews', ['id' => $review->id]);
});

test('deleting a product nulls its reviews far from the product instead of dropping them', function () {
    $user = User::factory()->create();
    $product = Product::factory()->published()->create(['stock_quantity' => 10]);
    $review = Review::factory()->create(['user_id' => $user->id, 'product_id' => $product->id]);

    $product->delete();

    $kept = Review::query()->find($review->id);
    expect($kept)->not->toBeNull();
    expect($kept->product_id)->toBeNull();
    expect($kept->verified_source)->toBe('order');
});
