<?php

use App\Models\Order;
use App\Models\Role;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Models\Wishlist;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Authorization ──────────────────────────────────────────────────────────

test('guest gets 401 on the dashboard', function () {
    $this->getJson('/api/v1/dashboard')->assertStatus(401);
});

// ─── Empty state ────────────────────────────────────────────────────────────

test('authenticated user with no data gets clean zeros, not an error', function () {
    $response = $this->actingAs($this->user)->getJson('/api/v1/dashboard');

    $response->assertOk()
        ->assertJsonPath('orders_count', 0)
        ->assertJsonPath('upcoming_bookings', [])
        ->assertJsonPath('wishlist_count', 0);
});

// ─── Aggregation ────────────────────────────────────────────────────────────

test('only upcoming, non-cancelled bookings appear, soonest first, capped at 3', function () {
    $createUpcoming = function (int $hoursFromNow) {
        $start = now()->addHours($hoursFromNow)->startOfHour();

        return ServiceBooking::factory()->create([
            'user_id' => $this->user->id,
            'scheduled_slot_start' => $start,
            'scheduled_slot_end' => $start->copy()->addMinutes(60),
        ]);
    };

    // 24h steps guarantee strictly increasing hour-floored slots.
    $soon = $createUpcoming(1);
    $mid = $createUpcoming(25);
    $late = $createUpcoming(49);
    $far = $createUpcoming(73); // beyond the 3 cap

    // Excluded: terminal (completed, past window with final price).
    ServiceBooking::factory()->completed()->create(['user_id' => $this->user->id]);

    // Excluded: cancelled (future window, terminal status).
    ServiceBooking::factory()->cancelled()->create(['user_id' => $this->user->id]);

    // Excluded: slot already begun.
    ServiceBooking::factory()->create([
        'user_id' => $this->user->id,
        'scheduled_slot_start' => now()->subHours(2),
        'scheduled_slot_end' => now()->subHours(1),
    ]);

    $response = $this->actingAs($this->user)->getJson('/api/v1/dashboard');

    $response->assertOk()
        ->assertJsonCount(3, 'upcoming_bookings');

    // Soonest first (ascending by scheduled_slot_start), capped at 3.
    expect(collect($response->json('upcoming_bookings'))->pluck('id')->all())
        ->toBe([$soon->id, $mid->id, $late->id]);

    $response
        ->assertJsonPath('upcoming_bookings.0.status', 'pending')
        ->assertJsonPath('upcoming_bookings.1.status', 'pending')
        ->assertJsonPath('upcoming_bookings.2.status', 'pending')
        ->assertJsonPath('upcoming_bookings.0.service.name', $soon->service->name)
        ->assertJsonPath('upcoming_bookings.1.service.name', $mid->service->name)
        ->assertJsonPath('upcoming_bookings.2.service.name', $late->service->name);
});

// ─── Ownership ──────────────────────────────────────────────────────────────

test('another customer data never leaks into the response', function () {
    Order::factory()->count(2)->create(['user_id' => $this->user->id]);
    Order::factory()->count(3)->create(['user_id' => $this->otherUser->id]);

    $start = now()->addDays(2)->startOfHour();
    ServiceBooking::factory()->create([
        'user_id' => $this->user->id,
        'scheduled_slot_start' => $start,
        'scheduled_slot_end' => $start->copy()->addMinutes(60),
    ]);
    ServiceBooking::factory()->count(2)->create(['user_id' => $this->otherUser->id]);
    ServiceBooking::factory()->completed()->create(['user_id' => $this->otherUser->id]);

    Wishlist::factory()->create(['user_id' => $this->user->id]);
    Wishlist::factory()->count(5)->create(['user_id' => $this->otherUser->id]);

    $response = $this->actingAs($this->user)->getJson('/api/v1/dashboard');

    $response->assertOk()
        ->assertJsonPath('orders_count', 2)
        ->assertJsonCount(1, 'upcoming_bookings')
        ->assertJsonPath('wishlist_count', 1);
});

// ─── Efficiency (Phase 12 hardening — no N+1) ───────────────────────────────

test('dashboard stays N+1-safe on the populated path', function () {
    Order::factory()->count(3)->create(['user_id' => $this->user->id]);
    ServiceBooking::factory()->count(3)->create(['user_id' => $this->user->id]);
    Wishlist::factory()->count(4)->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user);

    // Exactly 4 queries: orders count + bookings select + services eager-load
    // (single IN) + wishlist count. Fetching full collections just to count,
    // or lazy-loading service per row, would blow this count immediately.
    $this->expectsDatabaseQueryCount(4);

    $this->getJson('/api/v1/dashboard')
        ->assertOk()
        ->assertJsonPath('orders_count', 3)
        ->assertJsonCount(3, 'upcoming_bookings')
        ->assertJsonPath('wishlist_count', 4);
});
