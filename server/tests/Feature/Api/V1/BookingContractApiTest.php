<?php

use App\Models\Address;
use App\Models\BusinessSetting;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

function validBookingPayload(Service $service, Address $address, array $overrides = []): array
{
    $start = Carbon::parse('2026-12-01 10:00:00');

    return array_merge([
        'service_id' => $service->id,
        'scheduled_slot_start' => $start->format('Y-m-d H:i:s'),
        'scheduled_slot_end' => $start->copy()->addMinutes(60)->format('Y-m-d H:i:s'),
        'address_id' => $address->id,
        'issue_type' => 'hardware',
        'device_type' => 'laptop',
        'brand' => 'Dell',
        'model' => 'XPS 15',
        'problem_description' => 'Screen flickers after boot and sometimes freezes.',
    ], $overrides);
}

it('rejects booking when user gender is null', function () {
    $user = User::factory()->create(['gender' => null]);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create();

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $address));

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Please set your gender in your profile before booking.');
});

it('rejects booking when address map_link is null', function () {
    $user = User::factory()->create(['gender' => 'male']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create(['map_link' => null]);

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $address));

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Please add a Google Maps link to this address before booking.');
});

it('requires booking contract fields', function (string $field) {
    $user = User::factory()->create(['gender' => 'female']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create();

    $payload = validBookingPayload($service, $address);
    unset($payload[$field]);

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', $payload);

    $response->assertStatus(422)
        ->assertJsonValidationErrors([$field]);
})->with(['address_id', 'issue_type', 'device_type', 'brand', 'problem_description']);

it('rejects invalid booking enum values', function (string $field, string $value) {
    $user = User::factory()->create(['gender' => 'female']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create();

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $address, [
        $field => $value,
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors([$field]);
})->with([
    ['issue_type', 'plumbing'],
    ['device_type', 'phone'],
]);

it('rejects problem_description shorter than 10 chars', function () {
    $user = User::factory()->create(['gender' => 'female']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create();

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $address, [
        'problem_description' => 'short',
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['problem_description']);
});

it('returns 404 for foreign address on booking', function () {
    $user = User::factory()->create(['gender' => 'male']);
    $other = User::factory()->create(['gender' => 'female']);
    $service = Service::factory()->create(['is_published' => true]);
    $foreignAddress = Address::factory()->for($other)->create();

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $foreignAddress));

    $response->assertStatus(404)
        ->assertJsonPath('message', 'Not Found');
});

it('stores and returns booking snapshots and complaint fields', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode(['Karachi', 'Lahore']), 'type' => 'json'],
    );

    $user = User::factory()->create(['gender' => 'male']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create([
        'recipient_name' => 'Ali Khan',
        'phone' => '03001234567',
        'address_line_1' => '123 Main Street',
        'address_line_2' => 'Apt 4',
        'city' => 'Lahore',
        'postal_code' => '54000',
        'map_link' => 'https://maps.app.goo.gl/booking123',
    ]);

    $response = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $address));

    $response->assertStatus(201)
        ->assertJsonPath('booking.recipient_name', 'Ali Khan')
        ->assertJsonPath('booking.phone', '03001234567')
        ->assertJsonPath('booking.address_line_1', '123 Main Street')
        ->assertJsonPath('booking.address_line_2', 'Apt 4')
        ->assertJsonPath('booking.city', 'Lahore')
        ->assertJsonPath('booking.postal_code', '54000')
        ->assertJsonPath('booking.map_link', 'https://maps.app.goo.gl/booking123')
        ->assertJsonPath('booking.customer_gender', 'male')
        ->assertJsonPath('booking.issue_type', 'hardware')
        ->assertJsonPath('booking.device_type', 'laptop')
        ->assertJsonPath('booking.brand', 'Dell')
        ->assertJsonPath('booking.model', 'XPS 15');

    $bookingId = $response->json('booking.id');
    $this->assertDatabaseHas('service_bookings', [
        'id' => $bookingId,
        'recipient_name' => 'Ali Khan',
        'map_link' => 'https://maps.app.goo.gl/booking123',
        'customer_gender' => 'male',
        'issue_type' => 'hardware',
        'device_type' => 'laptop',
        'brand' => 'Dell',
        'model' => 'XPS 15',
    ]);

    $show = $this->actingAs($user)->getJson("/api/v1/bookings/{$bookingId}");
    $show->assertOk()
        ->assertJsonPath('booking.map_link', 'https://maps.app.goo.gl/booking123')
        ->assertJsonPath('booking.customer_gender', 'male')
        ->assertJsonPath('booking.issue_type', 'hardware');
});

it('keeps booking snapshot intact after address deletion', function () {
    $user = User::factory()->create(['gender' => 'other']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create([
        'map_link' => 'https://maps.app.goo.gl/snapshot',
        'recipient_name' => 'Snapshot User',
        'phone' => '03009998888',
        'address_line_1' => 'Snapshot Street',
        'city' => 'Karachi',
    ]);

    $create = $this->actingAs($user)->postJson('/api/v1/bookings', validBookingPayload($service, $address));
    $create->assertStatus(201);
    $bookingId = $create->json('booking.id');

    $delete = $this->actingAs($user)->deleteJson("/api/v1/addresses/{$address->id}");
    $delete->assertOk();

    $this->assertDatabaseHas('service_bookings', [
        'id' => $bookingId,
        'address_id' => null,
        'map_link' => 'https://maps.app.goo.gl/snapshot',
        'recipient_name' => 'Snapshot User',
        'customer_gender' => 'other',
    ]);
});

it('still rejects overlapping booking slot conflicts', function () {
    $user = User::factory()->create(['gender' => 'male']);
    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->for($user)->create();
    $payload = validBookingPayload($service, $address);

    $first = $this->actingAs($user)->postJson('/api/v1/bookings', $payload);
    $first->assertStatus(201);

    $secondUser = User::factory()->create(['gender' => 'female']);
    $secondAddress = Address::factory()->for($secondUser)->create();
    $second = $this->actingAs($secondUser)->postJson('/api/v1/bookings', validBookingPayload($service, $secondAddress));

    $second->assertStatus(422)
        ->assertJsonPath('message', 'This time slot is no longer available. Please choose a different time.');
});
