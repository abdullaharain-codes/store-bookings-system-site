<?php

use App\Models\Address;
use App\Models\Role;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
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

function bookingApiPayload(Service $service, Address $address, array $overrides = []): array
{
    $start = now()->addDays(1)->startOfHour();

    return array_merge([
        'service_id' => $service->id,
        'scheduled_slot_start' => $start->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => $start->copy()->addMinutes(60)->format('Y-m-d H:i:s'),
        'address_id' => $address->id,
        'issue_type' => 'hardware',
        'device_type' => 'laptop',
        'brand' => 'Dell',
        'model' => 'XPS 15',
        'problem_description' => 'Printer keeps jamming during long jobs.',
    ], $overrides);
}

test('guest gets 401 on every booking endpoint', function () {
    $this->postJson('/api/v1/bookings', [])->assertStatus(401);
    $this->getJson('/api/v1/bookings')->assertStatus(401);
    $this->getJson('/api/v1/bookings/1')->assertStatus(401);
    $this->postJson('/api/v1/bookings/1/cancel')->assertStatus(401);
});

// ─── POST /bookings (confirm booking) ───────────────────────────────────────

test('authenticated user can book a published service slot', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);
    $start = now()->addDays(1)->startOfHour();
    $end = $start->copy()->addMinutes(60);

    $response = $this->actingAs($this->user)->postJson('/api/v1/bookings', bookingApiPayload($service, $address, [
        'scheduled_slot_start' => $start->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => $end->format('Y-m-d H:i:s'),
        'problem_description' => 'Printer keeps jamming',
    ]));

    $response->assertCreated()
        ->assertJsonStructure([
            'booking' => [
                'id', 'user_id', 'service_id', 'address_id',
                'scheduled_slot_start', 'scheduled_slot_end', 'status',
                'problem_description', 'service',
            ],
        ])
        ->assertJsonPath('booking.user_id', $this->user->id)
        ->assertJsonPath('booking.service_id', $service->id)
        ->assertJsonPath('booking.address_id', $address->id)
        ->assertJsonPath('booking.status', 'pending')
        ->assertJsonPath('booking.problem_description', 'Printer keeps jamming');

    $this->assertDatabaseCount('service_bookings', 1);
});

test('store validates required fields and slot ordering', function () {
    $missingService = $this->actingAs($this->user)->postJson('/api/v1/bookings', [
        'scheduled_slot_start' => now()->addDays(1)->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => now()->addDays(1)->addMinutes(60)->format('Y-m-d H:i:s'),
    ]);

    $missingService->assertStatus(422)
        ->assertJsonValidationErrors(['service_id']);

    $endBeforeStart = $this->actingAs($this->user)->postJson('/api/v1/bookings', [
        'service_id' => 999999,
        'scheduled_slot_start' => now()->addDays(1)->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => now()->addDays(1)->subMinutes(60)->format('Y-m-d H:i:s'),
        'address_id' => Address::factory()->create(['user_id' => $this->user->id])->id,
        'issue_type' => 'hardware',
        'device_type' => 'laptop',
        'brand' => 'Dell',
        'model' => 'XPS 15',
        'problem_description' => 'Printer keeps jamming during long jobs.',
    ]);

    $endBeforeStart->assertStatus(422)
        ->assertJsonValidationErrors(['scheduled_slot_end']);
});

test('store rejects an already-taken window with 422', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $start = now()->addDays(1)->startOfHour();
    $end = $start->copy()->addMinutes(60);

    ServiceBooking::factory()->create([
        'user_id' => $this->otherUser->id,
        'service_id' => $service->id,
        'scheduled_slot_start' => $start,
        'scheduled_slot_end' => $end,
    ]);

    $address = Address::factory()->create(['user_id' => $this->user->id]);
    $response = $this->actingAs($this->user)->postJson('/api/v1/bookings', bookingApiPayload($service, $address, [
        'scheduled_slot_start' => $start->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => $end->format('Y-m-d H:i:s'),
    ]));

    $response->assertStatus(422)
        ->assertJsonPath('message', 'This time slot is no longer available. Please choose a different time.');
});

test('store rejects an unpublished service (404, indistinguishable from missing)', function () {
    $service = Service::factory()->create(['is_published' => false]);
    $start = now()->addDays(1)->startOfHour();

    $address = Address::factory()->create(['user_id' => $this->user->id]);
    $response = $this->actingAs($this->user)->postJson('/api/v1/bookings', bookingApiPayload($service, $address, [
        'scheduled_slot_start' => $start->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => $start->copy()->addMinutes(60)->format('Y-m-d H:i:s'),
    ]));

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');

    $this->assertDatabaseCount('service_bookings', 0);
});

test('store rejects an address belonging to another user (IDOR)', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $otherAddress = Address::factory()->create(['user_id' => $this->otherUser->id]);
    $start = now()->addDays(1)->startOfHour();

    $response = $this->actingAs($this->user)->postJson('/api/v1/bookings', [
        'service_id' => $service->id,
        'scheduled_slot_start' => $start->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => $start->copy()->addMinutes(60)->format('Y-m-d H:i:s'),
        'address_id' => $otherAddress->id,
        'issue_type' => 'hardware',
        'device_type' => 'laptop',
        'brand' => 'Dell',
        'model' => 'XPS 15',
        'problem_description' => 'Printer keeps jamming during long jobs.',
    ]);

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');

    $this->assertDatabaseCount('service_bookings', 0);
});

// ─── GET /bookings (list) ───────────────────────────────────────────────────

test('authenticated user sees only their bookings, paginated', function () {
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    ServiceBooking::factory()->count(2)->create([
        'user_id' => $this->user->id,
        'address_id' => $address->id,
    ]);
    ServiceBooking::factory()->create([
        'user_id' => $this->otherUser->id,
        'address_id' => $address->id,
    ]);

    $response = $this->actingAs($this->user)->getJson('/api/v1/bookings');

    $response->assertOk()
        ->assertJsonStructure(['bookings' => ['data', 'total', 'per_page', 'current_page']])
        ->assertJsonPath('bookings.total', 2)
        ->assertJsonCount(2, 'bookings.data');

    collect($response->json('bookings.data'))
        ->each(fn ($booking) => expect($booking['user_id'])->toBe($this->user->id));
});

// ─── GET /bookings/{booking} (show) ─────────────────────────────────────────

test('authenticated user can view their booking detail', function () {
    $booking = ServiceBooking::factory()->confirmed()->create(['user_id' => $this->user->id]);

    $response = $this->actingAs($this->user)->getJson("/api/v1/bookings/{$booking->id}");

    $response->assertOk()
        ->assertJsonPath('booking.id', $booking->id)
        ->assertJsonPath('booking.status', 'confirmed')
        ->assertJsonStructure(['booking' => ['service']]);
});

test('user cannot view another users booking (IDOR)', function () {
    $booking = ServiceBooking::factory()->confirmed()->create(['user_id' => $this->user->id]);

    $response = $this->actingAs($this->otherUser)->getJson("/api/v1/bookings/{$booking->id}");

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');
});

test('booking show 404 is indistinguishable from a genuinely-missing booking', function () {
    $response = $this->actingAs($this->user)->getJson('/api/v1/bookings/999999');

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');
});

// ─── POST /bookings/{booking}/cancel ────────────────────────────────────────

test('customer can cancel their own booking outside the cutoff', function () {
    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $this->user->id,
        'scheduled_slot_start' => now()->addHours(5)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(5)->startOfHour()->addMinutes(60),
    ]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/bookings/{$booking->id}/cancel");

    $response->assertOk()
        ->assertJsonPath('booking.status', 'cancelled');

    $this->assertDatabaseHas('service_bookings', [
        'id' => $booking->id,
        'status' => 'cancelled',
    ]);
});

test('customer cannot cancel within the two-hour cutoff (422)', function () {
    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $this->user->id,
        'scheduled_slot_start' => now()->addHour()->startOfHour(),
        'scheduled_slot_end' => now()->addHour()->startOfHour()->addMinutes(60),
    ]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/bookings/{$booking->id}/cancel");

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Bookings can only be cancelled at least 120 minutes before the scheduled slot.');
});

test('technician_on_the_way booking is hard-blocked for customers (422)', function () {
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create(['user_id' => $this->user->id]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/bookings/{$booking->id}/cancel");

    $response->assertStatus(422)
        ->assertJsonPath('message', 'This booking cannot be cancelled because the technician is already on the way.');
});

test('customer cannot cancel another users booking via HTTP (IDOR)', function () {
    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $this->user->id,
        'scheduled_slot_start' => now()->addHours(5)->startOfHour(),
        'scheduled_slot_end' => now()->addHours(5)->startOfHour()->addMinutes(60),
    ]);

    $response = $this->actingAs($this->otherUser)->postJson("/api/v1/bookings/{$booking->id}/cancel");

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');

    $this->assertDatabaseHas('service_bookings', [
        'id' => $booking->id,
        'status' => 'confirmed',
    ]);
});
