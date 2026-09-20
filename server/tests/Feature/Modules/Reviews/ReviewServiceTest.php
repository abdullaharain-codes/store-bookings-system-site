<?php

use App\Models\Address;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Modules\Reviews\Exceptions\ReviewsValidationException;
use App\Modules\Reviews\Services\ReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(ReviewService::class);
    $this->user = User::factory()->create();
    $this->actingAs($this->user);

    $this->makeProduct = fn (): Product => Product::factory()->published()->create(['stock_quantity' => 10]);

    $this->deliverProductTo = function (User $buyer, Product $product): Order {
        $address = Address::factory()->create(['user_id' => $buyer->id]);

        $order = Order::factory()->create([
            'user_id' => $buyer->id,
            'address_id' => $address->id,
            'recipient_name' => $address->recipient_name,
            'phone' => $address->phone,
            'address_line_1' => $address->address_line_1,
            'city' => $address->city,
            'status' => 'delivered',
            'payment_status' => 'paid',
        ]);

        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => '1.00',
            'quantity' => 1,
            'line_total' => '1.00',
        ]);

        return $order;
    };
});

function reviewServiceService(): Service
{
    return Service::factory()->create(['is_published' => true]);
}

function reviewServiceCompletedBooking(User $buyer, Service $service): ServiceBooking
{
    return ServiceBooking::factory()->completed()->create([
        'user_id' => $buyer->id,
        'service_id' => $service->id,
    ]);
}

// ─── Target XOR ───────────────────────────────────────────────────────────────

test('submitReview rejects both product_id and service_id', function () {
    $product = ($this->makeProduct)();
    $service = reviewServiceService();

    expect(fn () => $this->service->submitReview($this->user, [
        'product_id' => $product->id,
        'service_id' => $service->id,
        'rating' => 4,
    ]))->toThrow(ReviewsValidationException::class, 'A review must target exactly one product or service.');
});

test('submitReview rejects a review with no target', function () {
    expect(fn () => $this->service->submitReview($this->user, [
        'rating' => 4,
    ]))->toThrow(ReviewsValidationException::class, 'A review must target exactly one product or service.');
});

// ─── Product eligibility ──────────────────────────────────────────────────────

test('submitReview rejects a product without a delivered order', function () {
    $product = ($this->makeProduct)();

    expect(fn () => $this->service->submitReview($this->user, [
        'product_id' => $product->id,
        'rating' => 5,
    ]))->toThrow(ReviewsValidationException::class, 'You can only review a product from a delivered order.');
});

test('submitReview accepts a product from a delivered order', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->user, $product);

    $review = $this->service->submitReview($this->user, [
        'product_id' => $product->id,
        'rating' => 5,
        'comment' => 'Lovely.',
    ]);

    expect($review->product_id)->toBe($product->id);
    expect($review->service_id)->toBeNull();
    expect($review->rating)->toBe(5);
    expect($review->comment)->toBe('Lovely.');
    expect($review->verified_source)->toBe('order');
    expect($review->source_id)->toBe($order->id);
    expect($review->is_published)->toBeTrue();

    $log = AuditLog::query()
        ->where('entity', 'Review')
        ->where('entity_id', $review->id)
        ->where('action', 'created')
        ->firstOrFail();
    expect($log->actor_id)->toBe($this->user->id);
});

test('submitReview strips an absent comment to null', function () {
    $product = ($this->makeProduct)();
    ($this->deliverProductTo)($this->user, $product);

    $review = $this->service->submitReview($this->user, [
        'product_id' => $product->id,
        'rating' => 4,
    ]);

    expect($review->comment)->toBeNull();
});

test('submitReview rejects a product delivered to someone else', function () {
    $otherBuyer = User::factory()->create();
    $product = ($this->makeProduct)();
    ($this->deliverProductTo)($otherBuyer, $product);

    expect(fn () => $this->service->submitReview($this->user, [
        'product_id' => $product->id,
        'rating' => 5,
    ]))->toThrow(ReviewsValidationException::class, 'You can only review a product from a delivered order.');
});

// ─── Service eligibility ──────────────────────────────────────────────────────

test('submitReview rejects a service without a completed booking', function () {
    $service = reviewServiceService();

    expect(fn () => $this->service->submitReview($this->user, [
        'service_id' => $service->id,
        'rating' => 4,
    ]))->toThrow(ReviewsValidationException::class, 'You can only review a service after a completed booking.');
});

test('submitReview accepts a service from a completed booking', function () {
    $service = reviewServiceService();
    $booking = reviewServiceCompletedBooking($this->user, $service);

    $review = $this->service->submitReview($this->user, [
        'service_id' => $service->id,
        'rating' => 3,
    ]);

    expect($review->product_id)->toBeNull();
    expect($review->service_id)->toBe($service->id);
    expect($review->verified_source)->toBe('service_booking');
    expect($review->source_id)->toBe($booking->id);
    expect($review->is_published)->toBeTrue();
});

// ─── Duplicates ───────────────────────────────────────────────────────────────

test('submitReview rejects a second product review by the same user', function () {
    $product = ($this->makeProduct)();
    ($this->deliverProductTo)($this->user, $product);

    $this->service->submitReview($this->user, ['product_id' => $product->id, 'rating' => 5]);

    expect(fn () => $this->service->submitReview($this->user, [
        'product_id' => $product->id,
        'rating' => 2,
    ]))->toThrow(ReviewsValidationException::class, 'You have already reviewed this product.');
});

test('submitReview rejects a second service review by the same user', function () {
    $service = reviewServiceService();
    reviewServiceCompletedBooking($this->user, $service);

    $this->service->submitReview($this->user, ['service_id' => $service->id, 'rating' => 5]);

    expect(fn () => $this->service->submitReview($this->user, [
        'service_id' => $service->id,
        'rating' => 2,
    ]))->toThrow(ReviewsValidationException::class, 'You have already reviewed this service.');
});

// ─── Public reads ─────────────────────────────────────────────────────────────

test('listForProduct returns only published reviews, newest first', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->user, $product);

    $older = Review::factory()->forProduct($product, $order->id)->rated(4)->create(['user_id' => User::factory()->create()->id]);
    $newer = Review::factory()->forProduct($product, $order->id)->rated(5)->create(['user_id' => User::factory()->create()->id]);
    // created_at is not fillable, so pin it via the query builder directly.
    DB::table('reviews')->where('id', $newer->id)->update(['created_at' => now()->addMinute()]);
    Review::factory()->forProduct($product, $order->id)->unpublished()->rated(1)->create(['user_id' => User::factory()->create()->id]);

    $page = $this->service->listForProduct($product);

    expect($page->total())->toBe(2);
    expect($page->pluck('id')->all())->toBe([$newer->id, $older->id]);
});

test('listForService returns only published reviews', function () {
    $product = ($this->makeProduct)();
    ($this->deliverProductTo)($this->user, $product);
    $service = reviewServiceService();
    $booking = reviewServiceCompletedBooking($this->user, $service);

    $review = Review::factory()->forService($service, $booking->id)->rated(5)->create(['user_id' => User::factory()->create()->id]);
    Review::factory()->forService($service, $booking->id)->unpublished()->rated(1)->create(['user_id' => User::factory()->create()->id]);
    // A product review must never leak into the service list.
    Review::factory()->forProduct($product, 1)->rated(3)->create(['user_id' => User::factory()->create()->id]);

    $page = $this->service->listForService($service);

    expect($page->total())->toBe(1);
    expect($page->pluck('id')->all())->toBe([$review->id]);
});

// ─── Admin listing ────────────────────────────────────────────────────────────

test('listAllForAdmin includes unpublished reviews and filters by rating/status', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->user, $product);
    $service = reviewServiceService();
    $booking = reviewServiceCompletedBooking($this->user, $service);

    Review::factory()->forProduct($product, $order->id)->rated(5)->create(['user_id' => $this->user->id]);
    Review::factory()->forService($service, $booking->id)->unpublished()->rated(2)->create(['user_id' => $this->user->id]);

    expect($this->service->listAllForAdmin()->total())->toBe(2);
    expect($this->service->listAllForAdmin(['status' => 'published'])->total())->toBe(1);
    expect($this->service->listAllForAdmin(['status' => 'unpublished'])->total())->toBe(1);
    expect($this->service->listAllForAdmin(['rating' => 2])->total())->toBe(1);
    expect($this->service->listAllForAdmin(['product_id' => $product->id])->total())->toBe(1);
    expect($this->service->listAllForAdmin(['service_id' => $service->id])->total())->toBe(1);
});

// ─── Publish / unpublish ──────────────────────────────────────────────────────

test('publish and unpublish write audit rows with actor and previous state', function () {
    $product = ($this->makeProduct)();
    $review = Review::factory()->forProduct($product, 1)->unpublished()->rated(5)->create(['user_id' => $this->user->id]);

    $this->service->publish($review);

    $published = AuditLog::query()
        ->where('entity', 'Review')
        ->where('action', 'published')
        ->firstOrFail();
    expect($published->entity_id)->toBe($review->id);
    expect($published->actor_id)->toBe($this->user->id);
    expect($published->metadata)->toBe(['previous' => false]);

    $this->service->unpublish($review);

    $unpublished = AuditLog::query()
        ->where('entity', 'Review')
        ->where('action', 'unpublished')
        ->firstOrFail();
    expect($unpublished->metadata)->toBe(['previous' => true]);
    expect($review->refresh()->is_published)->toBeFalse();
});

test('repeated publish is an idempotent no-op (single audit row)', function () {
    $product = ($this->makeProduct)();
    $review = Review::factory()->forProduct($product, 1)->unpublished()->rated(5)->create(['user_id' => $this->user->id]);

    $this->service->publish($review);
    $this->service->publish($review);

    expect(AuditLog::query()->where('entity', 'Review')->where('action', 'published')->count())->toBe(1);
    expect($review->refresh()->is_published)->toBeTrue();
});
