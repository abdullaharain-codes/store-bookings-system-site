<?php

use App\Models\Address;
use App\Models\BusinessSetting;
use App\Models\Role;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

function serviceableBookingPayload(Service $service, Address $address, array $overrides = []): array
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

test('booking is allowed when address city matches serviceable list case-insensitively', function (string $city) {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode(['Karachi', 'Lahore']), 'type' => 'json'],
    );

    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->create([
        'user_id' => $this->user->id,
        'city' => $city,
    ]);

    $this->actingAs($this->user)
        ->postJson('/api/v1/bookings', serviceableBookingPayload($service, $address))
        ->assertCreated();

    $this->assertDatabaseCount('service_bookings', 1);
})->with([
    'lowercase' => ['karachi'],
    'trimmed uppercase' => [' LAHORE '],
]);

test('booking is rejected for a city outside the serviceable list with exact message and no side effects', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode(['Karachi', 'Lahore']), 'type' => 'json'],
    );

    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->create([
        'user_id' => $this->user->id,
        'city' => 'Islamabad',
    ]);

    $response = $this->actingAs($this->user)
        ->postJson('/api/v1/bookings', serviceableBookingPayload($service, $address));

    $response->assertStatus(422)
        ->assertExactJson([
            'message' => 'We do not currently serve Islamabad. Please choose an address in a served area.',
        ]);

    $this->assertDatabaseCount('service_bookings', 0);
    $this->assertDatabaseCount('slot_holds', 0);
});

test('empty serviceable list allows bookings in any city', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode([]), 'type' => 'json'],
    );

    $service = Service::factory()->create(['is_published' => true]);
    $address = Address::factory()->create([
        'user_id' => $this->user->id,
        'city' => 'Islamabad',
    ]);

    $this->actingAs($this->user)
        ->postJson('/api/v1/bookings', serviceableBookingPayload($service, $address))
        ->assertCreated();

    $this->assertDatabaseCount('service_bookings', 1);
});
