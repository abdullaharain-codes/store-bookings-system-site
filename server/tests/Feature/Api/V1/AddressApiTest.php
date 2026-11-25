<?php

use App\Models\Address;
use App\Models\Role;
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

test('guest gets 401 on every address endpoint', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->getJson('/api/v1/addresses')->assertStatus(401);
    $this->postJson('/api/v1/addresses', [])->assertStatus(401);
    $this->putJson("/api/v1/addresses/{$address->id}", [])->assertStatus(401);
    $this->deleteJson("/api/v1/addresses/{$address->id}")->assertStatus(401);
    $this->postJson("/api/v1/addresses/{$address->id}/default")->assertStatus(401);
});

// ─── GET /addresses ────────────────────────────────────────────────────────

test('authenticated user gets an empty address list initially', function () {
    $response = $this->actingAs($this->user)->getJson('/api/v1/addresses');

    $response->assertOk()
        ->assertJsonStructure(['addresses']);
});

test('authenticated user sees their addresses', function () {
    Address::factory()->create(['user_id' => $this->user->id]);
    Address::factory()->create(['user_id' => $this->user->id]);
    Address::factory()->create(['user_id' => $this->otherUser->id]);

    $response = $this->actingAs($this->user)->getJson('/api/v1/addresses');

    $response->assertOk()
        ->assertJsonCount(2, 'addresses');
});

// ─── POST /addresses ───────────────────────────────────────────────────────

test('authenticated user can create an address', function () {
    $data = [
        'recipient_name' => 'Ali Khan',
        'phone' => '0300-1234567',
        'address_line_1' => '123 Main Street',
        'city' => 'Lahore',
        'map_link' => 'https://maps.app.goo.gl/abc123',
    ];

    $response = $this->actingAs($this->user)->postJson('/api/v1/addresses', $data);

    $response->assertCreated()
        ->assertJsonPath('address.recipient_name', 'Ali Khan')
        ->assertJsonPath('address.city', 'Lahore')
        ->assertJsonPath('address.is_default', false);

    $this->assertDatabaseHas('addresses', [
        'user_id' => $this->user->id,
        'recipient_name' => 'Ali Khan',
    ]);
});

test('add to address validates required fields', function () {
    $response = $this->actingAs($this->user)->postJson('/api/v1/addresses', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['recipient_name', 'phone', 'address_line_1', 'city', 'map_link']);
});

// ─── PUT /addresses/{address} ──────────────────────────────────────────────

test('authenticated user can update their address', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $response = $this->actingAs($this->user)->putJson("/api/v1/addresses/{$address->id}", [
        'city' => 'Karachi',
    ]);

    $response->assertOk()
        ->assertJsonPath('address.city', 'Karachi');
});

// ─── DELETE /addresses/{address} ───────────────────────────────────────────

test('authenticated user can delete their address', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $response = $this->actingAs($this->user)->deleteJson("/api/v1/addresses/{$address->id}");

    $response->assertOk()
        ->assertJsonPath('message', 'Address deleted.');

    $this->assertDatabaseMissing('addresses', ['id' => $address->id]);
});

// ─── POST /addresses/{address}/default ─────────────────────────────────────

test('authenticated user can set default address', function () {
    $first = Address::factory()->create(['user_id' => $this->user->id, 'is_default' => true]);
    $second = Address::factory()->create(['user_id' => $this->user->id, 'is_default' => false]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/addresses/{$second->id}/default");

    $response->assertOk()
        ->assertJsonPath('message', 'Default address updated.');

    expect($second->fresh()->is_default)->toBeTrue();
    expect($first->fresh()->is_default)->toBeFalse();
});

// ─── IDOR ───────────────────────────────────────────────────────────────────

test('user cannot update another users address (IDOR)', function () {
    $address = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $response = $this->actingAs($this->user)->putJson("/api/v1/addresses/{$address->id}", [
        'city' => 'Hack',
    ]);

    $response->assertStatus(404);
});

test('user cannot delete another users address (IDOR)', function () {
    $address = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $response = $this->actingAs($this->user)->deleteJson("/api/v1/addresses/{$address->id}");

    $response->assertStatus(404);

    $this->assertDatabaseHas('addresses', ['id' => $address->id]);
});

test('user cannot set default on another users address (IDOR)', function () {
    $address = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $response = $this->actingAs($this->user)->postJson("/api/v1/addresses/{$address->id}/default");

    $response->assertStatus(404);
});
