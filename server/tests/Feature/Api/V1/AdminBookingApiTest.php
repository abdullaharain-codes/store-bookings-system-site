<?php

use App\Models\Role;
use App\Models\ServiceBooking;
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

// ─── Authorization ───────────────────────────────────────────────────────────

test('guest gets 401 on every admin booking endpoint', function () {
    $booking = ServiceBooking::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/bookings', []],
        ['getJson', "/api/v1/admin/bookings/{$booking->id}", []],
        ['postJson', "/api/v1/admin/bookings/{$booking->id}/assign-technician", [
            'technician_id' => $this->customer->id,
        ]],
        ['patchJson', "/api/v1/admin/bookings/{$booking->id}/status", ['status' => 'confirmed']],
        ['postJson', "/api/v1/admin/bookings/{$booking->id}/final-price", ['final_price' => 1000]],
    ];

    foreach ($endpoints as [$method, $uri, $payload]) {
        $this->{$method}($uri, $payload ?? [])->assertStatus(401);
    }
});

test('customer gets 403 on every admin booking endpoint', function () {
    $booking = ServiceBooking::factory()->create();

    $endpoints = [
        ['getJson', '/api/v1/admin/bookings', []],
        ['getJson', "/api/v1/admin/bookings/{$booking->id}", []],
        ['postJson', "/api/v1/admin/bookings/{$booking->id}/assign-technician", [
            'technician_id' => $this->customer->id,
        ]],
        ['patchJson', "/api/v1/admin/bookings/{$booking->id}/status", ['status' => 'confirmed']],
        ['postJson', "/api/v1/admin/bookings/{$booking->id}/final-price", ['final_price' => 1000]],
    ];

    foreach ($endpoints as [$method, $uri, $payload]) {
        $this->actingAs($this->customer)->{$method}($uri, $payload ?? [])->assertStatus(403);
    }
});

// ─── GET /admin/bookings (list) ──────────────────────────────────────────────

test('admin sees every booking including other users, with pagination envelope', function () {
    ServiceBooking::factory()->count(2)->create(['user_id' => $this->customer->id]);
    ServiceBooking::factory()->create(['user_id' => $this->admin->id]);

    $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/bookings');

    $response->assertOk()
        ->assertJsonStructure(['bookings' => ['data', 'links', 'current_page', 'total', 'per_page']])
        ->assertJsonPath('bookings.total', 3);
});

test('admin can filter bookings by status', function () {
    ServiceBooking::factory()->confirmed()->create(['user_id' => $this->customer->id]);
    ServiceBooking::factory()->technicianOnTheWay()->create(['user_id' => $this->customer->id]);
    ServiceBooking::factory()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/bookings?status=technician_on_the_way');

    $response->assertOk()
        ->assertJsonPath('bookings.total', 1)
        ->assertJsonPath('bookings.data.0.status', 'technician_on_the_way');
});

test('admin can filter bookings by slot date range (calendar view)', function () {
    $today = now()->addDay();
    $future = now()->addDays(3);

    ServiceBooking::factory()->create([
        'user_id' => $this->customer->id,
        'scheduled_slot_start' => $today,
    ]);
    ServiceBooking::factory()->create([
        'user_id' => $this->customer->id,
        'scheduled_slot_start' => $future,
    ]);

    $response = $this->actingAs($this->admin)->getJson(
        '/api/v1/admin/bookings?date_from='.$future->copy()->subDay()->toDateString().'&date_to='.$future->copy()->addDay()->toDateString(),
    );

    $response->assertOk()
        ->assertJsonPath('bookings.total', 1);
});

test('admin can search bookings by problem description or customer', function () {
    $otherCustomer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    ServiceBooking::factory()->create([
        'user_id' => $this->customer->id,
        'problem_description' => 'monitor is exploding',
    ]);
    ServiceBooking::factory()->create(['user_id' => $otherCustomer->id]);

    $byProblem = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/bookings?search=exploding');

    $byProblem->assertOk()->assertJsonPath('bookings.total', 1);

    $byCustomer = $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/bookings?search='.$this->customer->email);

    $byCustomer->assertOk()->assertJsonPath('bookings.total', 1);
});

// ─── GET /admin/bookings/{booking} (show) ────────────────────────────────────

test('admin can view any booking regardless of owner, with relations', function () {
    $booking = ServiceBooking::factory()->confirmed()->create([
        'user_id' => $this->customer->id,
        'technician_id' => $this->admin->id,
    ]);

    $response = $this->actingAs($this->admin)->getJson("/api/v1/admin/bookings/{$booking->id}");

    $response->assertOk()
        ->assertJsonPath('booking.id', $booking->id)
        ->assertJsonPath('booking.user_id', $this->customer->id)
        ->assertJsonStructure(['booking' => ['service', 'user', 'address', 'technician']]);
});

// ─── POST /admin/bookings/{booking}/assign-technician ────────────────────────

test('admin assigns a technician and the action is audit-logged with the actor', function () {
    $technician = User::factory()->create();
    $booking = ServiceBooking::factory()->confirmed()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->postJson("/api/v1/admin/bookings/{$booking->id}/assign-technician", [
        'technician_id' => $technician->id,
    ]);

    $response->assertOk()
        ->assertJsonPath('booking.technician_id', $technician->id);

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'technician_assigned',
        'actor_id' => $this->admin->id,
        'metadata' => json_encode(['technician_id' => $technician->id]),
    ]);
});

test('assign-technician rejects a nonexistent technician id (422 validation)', function () {
    $booking = ServiceBooking::factory()->confirmed()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->postJson("/api/v1/admin/bookings/{$booking->id}/assign-technician", [
        'technician_id' => 999999,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['technician_id']);
});

// ─── PATCH /admin/bookings/{booking}/status ──────────────────────────────────

test('admin transitions a booking through the state machine', function () {
    $booking = ServiceBooking::factory()->create(['user_id' => $this->customer->id]);

    $confirmed = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'confirmed',
    ]);

    $confirmed->assertOk()->assertJsonPath('booking.status', 'confirmed');

    $onTheWay = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'technician_on_the_way',
    ]);

    $onTheWay->assertOk()->assertJsonPath('booking.status', 'technician_on_the_way');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'status_changed',
        'actor_id' => $this->admin->id,
        'metadata' => json_encode(['from' => 'confirmed', 'to' => 'technician_on_the_way']),
    ]);
});

test('admin cannot hop statuses (pending to technician_on_the_way)', function () {
    $booking = ServiceBooking::factory()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'technician_on_the_way',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Cannot transition from "pending" to "technician_on_the_way".');

    $this->assertDatabaseMissing('audit_logs', ['entity_id' => $booking->id]);
});

test('a completed booking is terminal and cannot revert', function () {
    $booking = ServiceBooking::factory()->completed()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'pending',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Cannot transition from "completed" to "pending".');
});

test('admin can cancel any booking via the status endpoint (admin override)', function () {
    // technician_on_the_way would hard-block a CUSTOMER cancellation; the
    // PATCH /status 'cancelled' route goes through cancelBooking(isAdmin: true)
    // and must override (PRD §10 "Admin can always override").
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'cancelled',
    ]);

    $response->assertOk()
        ->assertJsonPath('booking.status', 'cancelled');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'cancelled',
        'actor_id' => $this->admin->id,
        'metadata' => json_encode(['previous_status' => 'technician_on_the_way', 'cancelled_by' => 'admin']),
    ]);
});

// ─── POST /admin/bookings/{booking}/final-price ──────────────────────────────

test('final-price completes a dispatched booking and is audit-logged', function () {
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->postJson("/api/v1/admin/bookings/{$booking->id}/final-price", [
        'final_price' => 3450.5,
    ]);

    $response->assertOk()
        ->assertJsonPath('booking.status', 'completed')
        ->assertJsonPath('booking.final_price', '3450.50');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'ServiceBooking',
        'entity_id' => $booking->id,
        'action' => 'final_price_entered',
        'actor_id' => $this->admin->id,
        'metadata' => json_encode(['final_price' => '3450.50']),
    ]);
});

test('final-price is rejected before the technician is dispatched (422)', function () {
    $booking = ServiceBooking::factory()->confirmed()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->postJson("/api/v1/admin/bookings/{$booking->id}/final-price", [
        'final_price' => 1000,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Final price can only be entered to complete a booking whose technician has been dispatched.');
});

test('final-price validates the amount', function () {
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create(['user_id' => $this->customer->id]);

    $missing = $this->actingAs($this->admin)->postJson("/api/v1/admin/bookings/{$booking->id}/final-price", []);
    $missing->assertStatus(422)->assertJsonValidationErrors(['final_price']);

    $negative = $this->actingAs($this->admin)->postJson("/api/v1/admin/bookings/{$booking->id}/final-price", [
        'final_price' => -5,
    ]);
    $negative->assertStatus(422)->assertJsonValidationErrors(['final_price']);
});

// ─── Terminal-guard cancel (data-integrity, not bypassable by admin) ─────────

test('admin cannot cancel a completed booking via the status endpoint (422, untouched)', function () {
    $booking = ServiceBooking::factory()->completed()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'cancelled',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'A completed booking cannot be cancelled.');

    $this->assertDatabaseHas('service_bookings', [
        'id' => $booking->id,
        'status' => 'completed',
    ]);

    $this->assertSame($booking->final_price, ServiceBooking::query()->find($booking->id)->final_price);
});

test('cancelling an already-cancelled booking is an idempotency-safe 422', function () {
    $booking = ServiceBooking::factory()->cancelled()->create(['user_id' => $this->customer->id]);

    $response = $this->actingAs($this->admin)->patchJson("/api/v1/admin/bookings/{$booking->id}/status", [
        'status' => 'cancelled',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'This booking has already been cancelled.');

    $this->assertDatabaseHas('service_bookings', [
        'id' => $booking->id,
        'status' => 'cancelled',
    ]);
});
