<?php

use App\Models\Address;
use App\Models\Order;
use App\Models\Product;
use App\Models\Review;
use App\Models\Role;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    $this->makeProduct = fn (): Product => Product::factory()->published()->create(['stock_quantity' => 10]);

    // A review belongs to a real customer; distinct reviewers are needed for
    // distinct reviews of the SAME target (one review per customer).
    $this->reviewer = fn (): User => User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

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
            'unit_price' => number_format($product->price, 2, '.', ''),
            'quantity' => 1,
            'line_total' => number_format($product->price, 2, '.', ''),
        ]);

        return $order;
    };

    $this->completeServiceBooking = function (User $buyer, Service $service): ServiceBooking {
        return ServiceBooking::factory()->completed()->create([
            'user_id' => $buyer->id,
            'service_id' => $service->id,
        ]);
    };
});

// ─── Authorization ─────────────────────────────────────────────────────────────

test('guest cannot submit a review (401)', function () {
    $this->postJson('/api/v1/reviews', [
        'product_id' => 1,
        'rating' => 5,
        'comment' => 'Nice.',
    ])->assertStatus(401);
});

test('admin endpoints: guest gets 401 and customer gets 403', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $product);
    $review = Review::factory()->forProduct($product, $order->id)->create(['user_id' => $this->customer->id]);

    $endpoints = [
        ['getJson', '/api/v1/admin/reviews'],
        ['postJson', "/api/v1/admin/reviews/{$review->id}/publish"],
        ['postJson', "/api/v1/admin/reviews/{$review->id}/unpublish"],
    ];

    foreach ($endpoints as $endpoint) {
        [$method, $uri] = $endpoint;
        $this->{$method}($uri)->assertStatus(401);
    }

    foreach ($endpoints as $endpoint) {
        [$method, $uri] = $endpoint;
        $this->actingAs($this->customer)->{$method}($uri)->assertStatus(403);
    }
});

// ─── POST /reviews — target set (XOR) ─────────────────────────────────────────

test('a review must target exactly one of product or service (422)', function () {
    $product = ($this->makeProduct)();
    $service = Service::factory()->create(['is_published' => true]);

    // Both.
    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'service_id' => $service->id,
        'rating' => 4,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'A review must target exactly one product or service.');

    // Neither.
    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'rating' => 4,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'A review must target exactly one product or service.');

    $this->assertDatabaseCount('reviews', 0);
});

test('rating must be an integer between 1 and 5 (422)', function () {
    $product = ($this->makeProduct)();

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 0,
    ])->assertStatus(422);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 6,
    ])->assertStatus(422);
});

// ─── POST /reviews — purchase eligibility ─────────────────────────────────────

test('cannot review a product that was never delivered (422)', function () {
    $product = ($this->makeProduct)();

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 5,
        'comment' => 'Looks great.',
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You can only review a product from a delivered order.');
});

test('a delivered order for a DIFFERENT product does not grant a review (422)', function () {
    $other = ($this->makeProduct)();
    ($this->deliverProductTo)($this->customer, $other);
    $target = ($this->makeProduct)();

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $target->id,
        'rating' => 5,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You can only review a product from a delivered order.');
});

test('a pending order does not grant a product review (422)', function () {
    $product = ($this->makeProduct)();
    $address = Address::factory()->create(['user_id' => $this->customer->id]);

    $order = Order::factory()->create([
        'user_id' => $this->customer->id,
        'address_id' => $address->id,
        'recipient_name' => $address->recipient_name,
        'phone' => $address->phone,
        'address_line_1' => $address->address_line_1,
        'city' => $address->city,
        'status' => 'pending',
        'payment_status' => 'pending',
    ]);
    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => '1.00',
        'quantity' => 1,
        'line_total' => '1.00',
    ]);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 5,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You can only review a product from a delivered order.');
});

test('a customer with a delivered order can review the product (201)', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $product);

    $response = $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 5,
        'comment' => 'Delivered on time and works perfectly.',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('review.product_id', $product->id)
        ->assertJsonPath('review.service_id', null)
        ->assertJsonPath('review.rating', 5)
        ->assertJsonPath('review.comment', 'Delivered on time and works perfectly.')
        ->assertJsonPath('review.verified_source', 'order')
        ->assertJsonPath('review.source_id', $order->id)
        ->assertJsonPath('review.is_published', true);

    $this->assertDatabaseHas('reviews', [
        'user_id' => $this->customer->id,
        'product_id' => $product->id,
        'service_id' => null,
        'rating' => 5,
        'verified_source' => 'order',
        'source_id' => $order->id,
        'is_published' => true,
    ]);
});

test('a customer with a completed booking can review the service (201)', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $booking = ($this->completeServiceBooking)($this->customer, $service);

    $response = $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'service_id' => $service->id,
        'rating' => 4,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('review.product_id', null)
        ->assertJsonPath('review.service_id', $service->id)
        ->assertJsonPath('review.verified_source', 'service_booking')
        ->assertJsonPath('review.source_id', $booking->id);

    $this->assertDatabaseHas('reviews', [
        'user_id' => $this->customer->id,
        'service_id' => $service->id,
        'verified_source' => 'service_booking',
        'source_id' => $booking->id,
        'is_published' => true,
    ]);
});

test('a completed booking for a DIFFERENT service does not grant a review (422)', function () {
    $other = Service::factory()->create(['is_published' => true]);
    ($this->completeServiceBooking)($this->customer, $other);
    $target = Service::factory()->create(['is_published' => true]);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'service_id' => $target->id,
        'rating' => 4,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You can only review a service after a completed booking.');
});

test('a pending booking does not grant a service review (422)', function () {
    $service = Service::factory()->create(['is_published' => true]);
    ServiceBooking::factory()->create([
        'user_id' => $this->customer->id,
        'service_id' => $service->id,
    ]);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'service_id' => $service->id,
        'rating' => 4,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You can only review a service after a completed booking.');
});

// ─── POST /reviews — duplicates ───────────────────────────────────────────────

test('a product can be reviewed at most once (422 on repeat)', function () {
    $product = ($this->makeProduct)();
    ($this->deliverProductTo)($this->customer, $product);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 5,
    ])->assertStatus(201);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'product_id' => $product->id,
        'rating' => 1,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You have already reviewed this product.');

    $this->assertDatabaseCount('reviews', 1);
});

test('a service can be reviewed at most once (422 on repeat)', function () {
    $service = Service::factory()->create(['is_published' => true]);
    ($this->completeServiceBooking)($this->customer, $service);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'service_id' => $service->id,
        'rating' => 5,
    ])->assertStatus(201);

    $this->actingAs($this->customer)->postJson('/api/v1/reviews', [
        'service_id' => $service->id,
        'rating' => 2,
    ])->assertStatus(422)
        ->assertJsonPath('message', 'You have already reviewed this service.');

    $this->assertDatabaseCount('reviews', 1);
});

// ─── GET /products/{slug}/reviews ─────────────────────────────────────────────

test('public product review read needs no auth and lists only published reviews', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $product);

    $reviewerA = ($this->reviewer)();
    $reviewerB = ($this->reviewer)();
    $hiddenReviewer = ($this->reviewer)();

    $older = Review::factory()->forProduct($product, $order->id)->rated(4)->create(['user_id' => $reviewerA->id]);
    $newer = Review::factory()->forProduct($product, $order->id)->rated(5)->create(['user_id' => $reviewerB->id]);
    // created_at is not fillable, so pin it via the query builder directly.
    DB::table('reviews')->where('id', $newer->id)->update(['created_at' => now()->addMinute()]);
    Review::factory()->forProduct($product, $order->id)->unpublished()->rated(1)->create(['user_id' => $hiddenReviewer->id]);

    $response = $this->getJson("/api/v1/products/{$product->slug}/reviews");

    $response->assertOk()
        ->assertJsonPath('reviews.total', 2)
        ->assertJsonPath('reviews.data.0.id', $newer->id)
        ->assertJsonPath('reviews.data.0.rating', 5)
        ->assertJsonPath('reviews.data.0.user.name', $reviewerB->name)
        ->assertJsonPath('reviews.data.0.verified_source', 'order')
        ->assertJsonPath('reviews.data.1.id', $older->id);
});

test('an unpublished review is indistinguishable from no review on the public read', function () {
    // Product A has ONE review, but it is hidden; product B has none. Beyond
    // the slug embedded in the paginator URLs, the public payloads must be
    // identical — an unpublished review can never be detected from the API.
    $withHiddenReview = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $withHiddenReview);
    Review::factory()->forProduct($withHiddenReview, $order->id)->unpublished()->rated(1)
        ->create(['user_id' => ($this->reviewer)()->id, 'comment' => 'Terrible.']);

    $withoutReviews = ($this->makeProduct)();

    $hidden = $this->getJson("/api/v1/products/{$withHiddenReview->slug}/reviews");
    $bare = $this->getJson("/api/v1/products/{$withoutReviews->slug}/reviews");

    $hidden->assertOk();
    $bare->assertOk();

    $hiddenPayload = $hidden->json('reviews');
    $barePayload = $bare->json('reviews');

    // URL-bearing paginator fields are the only permitted divergence (the
    // slug lives in them); everything else — including ALL of meta — must
    // match byte-for-byte.
    foreach (['first_page_url', 'last_page_url', 'path', 'links'] as $key) {
        unset($hiddenPayload[$key], $barePayload[$key]);
    }
    unset($hiddenPayload['meta']['path'], $hiddenPayload['meta']['links']);
    unset($barePayload['meta']['path'], $barePayload['meta']['links']);

    expect($hiddenPayload)->toBe($barePayload)
        ->and($hiddenPayload['total'])->toBe(0)
        ->and($hiddenPayload['data'])->toBe([]);
});

test('missing and unpublished product slugs both 404 on the review read', function () {
    $unpublished = Product::factory()->create(['is_published' => false]);

    $this->getJson('/api/v1/products/definitely-not-here/reviews')
        ->assertStatus(404)->assertJsonPath('message', 'Not Found');

    $this->getJson("/api/v1/products/{$unpublished->slug}/reviews")
        ->assertStatus(404)->assertJsonPath('message', 'Not Found');
});

// ─── GET /services/{slug}/reviews ─────────────────────────────────────────────

test('public service review read lists only published reviews', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $booking = ($this->completeServiceBooking)($this->customer, $service);

    $reviewer = ($this->reviewer)();
    $hiddenReviewer = ($this->reviewer)();

    Review::factory()->forService($service, $booking->id)->rated(5)->create(['user_id' => $reviewer->id]);
    Review::factory()->forService($service, $booking->id)->unpublished()->rated(1)->create(['user_id' => $hiddenReviewer->id]);

    $response = $this->getJson("/api/v1/services/{$service->slug}/reviews");

    $response->assertOk()
        ->assertJsonPath('reviews.total', 1)
        ->assertJsonPath('reviews.data.0.rating', 5)
        ->assertJsonPath('reviews.data.0.verified_source', 'service_booking')
        ->assertJsonPath('reviews.data.0.user.name', $reviewer->name);
});

test('missing and unpublished service slugs both 404 on the review read', function () {
    $unpublished = Service::factory()->create(['is_published' => false]);

    $this->getJson('/api/v1/services/definitely-not-here/reviews')
        ->assertStatus(404)->assertJsonPath('message', 'Not Found');

    $this->getJson("/api/v1/services/{$unpublished->slug}/reviews")
        ->assertStatus(404)->assertJsonPath('message', 'Not Found');
});

// ─── Admin listing ────────────────────────────────────────────────────────────

test('admin listing includes unpublished reviews and supports filters', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $product);
    $service = Service::factory()->create(['is_published' => true]);
    $booking = ($this->completeServiceBooking)($this->customer, $service);

    Review::factory()->forProduct($product, $order->id)->rated(5)->create(['user_id' => $this->customer->id]);
    Review::factory()->forService($service, $booking->id)->unpublished()->rated(2)->create(['user_id' => $this->customer->id]);

    $this->actingAs($this->admin)->getJson('/api/v1/admin/reviews')
        ->assertOk()
        ->assertJsonPath('reviews.total', 2);

    $this->actingAs($this->admin)->getJson('/api/v1/admin/reviews?status=unpublished')
        ->assertOk()
        ->assertJsonPath('reviews.total', 1)
        ->assertJsonPath('reviews.data.0.is_published', false);

    $this->actingAs($this->admin)->getJson('/api/v1/admin/reviews?rating=5')
        ->assertOk()
        ->assertJsonPath('reviews.total', 1)
        ->assertJsonPath('reviews.data.0.product.id', $product->id);
});

// ─── Admin publish / unpublish ────────────────────────────────────────────────

test('admin unpublish hides a review from the public read and audits it', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $product);
    $review = Review::factory()->forProduct($product, $order->id)->rated(5)->create(['user_id' => $this->customer->id]);

    $this->getJson("/api/v1/products/{$product->slug}/reviews")
        ->assertOk()->assertJsonPath('reviews.total', 1);

    $this->actingAs($this->admin)->postJson("/api/v1/admin/reviews/{$review->id}/unpublish")
        ->assertOk()
        ->assertJsonPath('review.is_published', false);

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Review',
        'entity_id' => $review->id,
        'action' => 'unpublished',
    ]);

    $this->getJson("/api/v1/products/{$product->slug}/reviews")
        ->assertOk()->assertJsonPath('reviews.total', 0);
});

test('admin publish restores a review to the public read and audits it', function () {
    $product = ($this->makeProduct)();
    $order = ($this->deliverProductTo)($this->customer, $product);
    $review = Review::factory()->forProduct($product, $order->id)->unpublished()->rated(5)
        ->create(['user_id' => $this->customer->id]);

    $this->actingAs($this->admin)->postJson("/api/v1/admin/reviews/{$review->id}/publish")
        ->assertOk()
        ->assertJsonPath('review.is_published', true);

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Review',
        'entity_id' => $review->id,
        'action' => 'published',
    ]);

    $this->getJson("/api/v1/products/{$product->slug}/reviews")
        ->assertOk()
        ->assertJsonPath('reviews.total', 1)
        ->assertJsonPath('reviews.data.0.id', $review->id);
});
