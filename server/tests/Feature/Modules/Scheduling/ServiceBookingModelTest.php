<?php

use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('service_bookings table exists with the expected columns', function () {
    expect(Schema::hasTable('service_bookings'))->toBeTrue();

    foreach ([
        'id',
        'user_id',
        'service_id',
        'technician_id',
        'address_id',
        'scheduled_slot_start',
        'scheduled_slot_end',
        'status',
        'problem_description',
        'final_price',
        'cancelled_at',
        'rescheduled_from_id',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('service_bookings', $column))->toBeTrue();
    }
});

test('booking window, status and user_id carry the expected indexes', function () {
    $indexes = collect(DB::select("PRAGMA index_list('service_bookings')"))
        ->pluck('name');

    expect($indexes)->toContain('service_bookings_scheduled_slot_start_scheduled_slot_end_index');
    expect($indexes)->toContain('service_bookings_status_index');
    expect($indexes)->toContain('service_bookings_user_id_index');
});

test('foreign keys are real constraints against users, services and addresses', function () {
    $fks = collect(DB::select("PRAGMA foreign_key_list('service_bookings')"));

    $toBeConfirmed = [
        // [column, referenced table]
        ['user_id', 'users'],
        ['service_id', 'services'],
        ['address_id', 'addresses'],
        ['rescheduled_from_id', 'service_bookings'],
    ];
    foreach ($toBeConfirmed as [$column, $table]) {
        $fk = $fks->firstWhere('from', $column);
        expect($fk)->not->toBeNull();
        expect($fk->table)->toBe($table);
    }

    // technician_id also references users.
    expect($fks->firstWhere('from', 'technician_id')->table)->toBe('users');
});

test('factory creates a valid pending booking for a future slot', function () {
    $booking = ServiceBooking::factory()->create();

    $this->assertDatabaseHas('service_bookings', ['id' => $booking->id]);

    expect($booking->status)->toBe('pending');
    expect($booking->scheduled_slot_start)->toBeGreaterThan(now());
    expect($booking->scheduled_slot_end)->toBeGreaterThan($booking->scheduled_slot_start);
    // Pending bookings carry no final price and were not cancelled.
    expect($booking->final_price)->toBeNull();
    expect($booking->cancelled_at)->toBeNull();
    expect($booking->technician_id)->toBeNull();
    expect($booking->problem_description)->not->toBeEmpty();

    // Relationships resolve to real rows.
    expect($booking->user)->not->toBeNull();
    expect($booking->service)->not->toBeNull();
    expect($booking->address)->not->toBeNull();
    expect($booking->user->getAttribute('id'))->toBe($booking->user_id);
});

test('confirmed() state moves the booking into the confirmed lifecycle', function () {
    $booking = ServiceBooking::factory()->confirmed()->create();

    expect($booking->status)->toBe('confirmed');
    expect($booking->final_price)->toBeNull();
    expect($booking->scheduled_slot_start)->toBeGreaterThan(now());
});

test('completed() state carries a final price and a past slot', function () {
    $booking = ServiceBooking::factory()->completed()->create();

    expect($booking->status)->toBe('completed');
    expect($booking->final_price)->not->toBeNull();
    expect((float) $booking->final_price)->toBeGreaterThan(0);
    expect($booking->scheduled_slot_start)->toBeLessThan(now());
});

test('cancelled() state records when the booking was cancelled', function () {
    $booking = ServiceBooking::factory()->cancelled()->create();

    expect($booking->status)->toBe('cancelled');
    expect($booking->cancelled_at)->not->toBeNull();
    expect($booking->cancelled_at)->toBeLessThan(now());
    expect($booking->final_price)->toBeNull();
});

test('technicianOnTheWay() state uses an imminent slot (past the hard block)', function () {
    $booking = ServiceBooking::factory()->technicianOnTheWay()->create();

    expect($booking->status)->toBe('technician_on_the_way');
    expect($booking->scheduled_slot_start)->toBeGreaterThan(now());
    expect($booking->scheduled_slot_start)->toBeLessThan(now()->addHour());
});

test('deleting a service still referenced by a booking is restricted', function () {
    $booking = ServiceBooking::factory()->create();
    $service = $booking->service;

    expect(fn () => $service->delete())->toThrow(QueryException::class);

    $this->assertDatabaseHas('services', ['id' => $service->id]);
});

test('deleting a user still referenced by a booking is restricted', function () {
    $booking = ServiceBooking::factory()->create();
    $user = $booking->user;

    expect(fn () => $user->delete())->toThrow(QueryException::class);

    $this->assertDatabaseHas('users', ['id' => $user->id]);
});

test('deleting an address still referenced by a booking is restricted', function () {
    // Service bookings do NOT snapshot address fields (unlike orders), so the
    // address row IS the service location — restrict, not nullOnDelete.
    $booking = ServiceBooking::factory()->create();
    $address = $booking->address;

    expect(fn () => $address->delete())->toThrow(QueryException::class);
});

test('rescheduledFrom and rescheduledTo link a reschedule chain', function () {
    $original = ServiceBooking::factory()->confirmed()->create();
    $rescheduled = ServiceBooking::factory()->confirmed()
        ->create(['rescheduled_from_id' => $original->id]);

    expect($rescheduled->rescheduledFrom->is($original))->toBeTrue();
    expect($original->rescheduledTo->is($rescheduled))->toBeTrue();
});

test('technician_id is nullable and can reference a user when assigned', function () {
    $unassigned = ServiceBooking::factory()->create();
    expect($unassigned->technician)->toBeNull();

    $technician = User::factory()->create();
    $assigned = ServiceBooking::factory()->create(['technician_id' => $technician->id]);

    expect($assigned->technician->getAttribute('id'))->toBe($technician->id);
});
