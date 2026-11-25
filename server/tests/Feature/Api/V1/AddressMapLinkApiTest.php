<?php

use App\Models\Address;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function validAddressPayload(array $overrides = []): array
{
    return array_merge([
        'recipient_name' => 'Test User',
        'phone' => '03001234567',
        'address_line_1' => '123 Test Street',
        'address_line_2' => null,
        'city' => 'Lahore',
        'postal_code' => '54000',
        'label' => 'Home',
        'map_link' => 'https://maps.app.goo.gl/abc123',
    ], $overrides);
}

it('rejects address create without map_link', function () {
    $user = User::factory()->create();

    $payload = validAddressPayload();
    unset($payload['map_link']);

    $response = $this->actingAs($user)->postJson('/api/v1/addresses', $payload);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['map_link']);
});

it('creates address with allowed map_link host', function (string $mapLink) {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/api/v1/addresses', validAddressPayload([
        'map_link' => $mapLink,
    ]));

    $response->assertStatus(201)
        ->assertJsonPath('address.map_link', $mapLink);

    $this->assertDatabaseHas('addresses', [
        'user_id' => $user->id,
        'map_link' => $mapLink,
    ]);
})->with([
    'https://www.google.com/maps/place/Lahore',
    'https://google.com/maps?q=Lahore',
    'https://maps.google.com/?q=Lahore',
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/abc123',
]);

it('rejects address create with disallowed map_link', function (string $mapLink) {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/api/v1/addresses', validAddressPayload([
        'map_link' => $mapLink,
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['map_link']);
})->with([
    'http://maps.app.goo.gl/abc123',
    'https://evil.test/maps',
    'https://google.com.evil.test/maps?q=x',
    'https://evilgoogle.com/maps?q=x',
    'https://user:pass@maps.app.goo.gl/abc123',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://google.com/search?q=Lahore',
    'https://www.google.com/search?q=Lahore',
    'https://goo.gl/notmaps/abc123',
]);

it('rejects address create with over-500-length map_link', function () {
    $user = User::factory()->create();
    $longLink = 'https://maps.app.goo.gl/'.str_repeat('a', 500);

    $response = $this->actingAs($user)->postJson('/api/v1/addresses', validAddressPayload([
        'map_link' => $longLink,
    ]));

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['map_link']);
});

it('updates address map_link with valid value', function () {
    $user = User::factory()->create();
    $address = Address::factory()->for($user)->create([
        'map_link' => 'https://maps.app.goo.gl/old123',
    ]);

    $response = $this->actingAs($user)->putJson("/api/v1/addresses/{$address->id}", [
        'map_link' => 'https://maps.app.goo.gl/new456',
    ]);

    $response->assertOk()
        ->assertJsonPath('address.map_link', 'https://maps.app.goo.gl/new456');

    $this->assertDatabaseHas('addresses', [
        'id' => $address->id,
        'map_link' => 'https://maps.app.goo.gl/new456',
    ]);
});

it('rejects address update with invalid map_link', function () {
    $user = User::factory()->create();
    $address = Address::factory()->for($user)->create([
        'map_link' => 'https://maps.app.goo.gl/old123',
    ]);

    $response = $this->actingAs($user)->putJson("/api/v1/addresses/{$address->id}", [
        'map_link' => 'https://evil.test/maps',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['map_link']);

    $this->assertDatabaseHas('addresses', [
        'id' => $address->id,
        'map_link' => 'https://maps.app.goo.gl/old123',
    ]);
});

it('returns 404 when updating another users address even with valid map_link', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $address = Address::factory()->for($owner)->create([
        'map_link' => 'https://maps.app.goo.gl/old123',
    ]);

    $response = $this->actingAs($other)->putJson("/api/v1/addresses/{$address->id}", [
        'map_link' => 'https://maps.app.goo.gl/new456',
    ]);

    $response->assertStatus(404);
});
