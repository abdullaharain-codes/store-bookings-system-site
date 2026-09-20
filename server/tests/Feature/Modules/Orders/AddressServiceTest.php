<?php

use App\Models\Address;
use App\Models\Role;
use App\Models\User;
use App\Modules\Orders\Services\AddressService;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->service = app(AddressService::class);
});

// ─── CRUD ──────────────────────────────────────────────────────────────────

test('createAddress creates an address belonging to the user', function () {
    $data = [
        'recipient_name' => 'Ali Khan',
        'phone' => '0300-1234567',
        'address_line_1' => '123 Main Street',
        'city' => 'Lahore',
    ];

    $address = $this->service->createAddress($this->user, $data);

    expect($address->user_id)->toBe($this->user->id)
        ->and($address->recipient_name)->toBe('Ali Khan')
        ->and($address->city)->toBe('Lahore');

    $this->assertDatabaseHas('addresses', [
        'user_id' => $this->user->id,
        'recipient_name' => 'Ali Khan',
    ]);
});

test('listAddresses returns only the users addresses', function () {
    Address::factory()->create(['user_id' => $this->user->id]);
    Address::factory()->create(['user_id' => $this->user->id]);
    Address::factory()->create(['user_id' => $this->otherUser->id]);

    $addresses = $this->service->listAddresses($this->user);

    expect($addresses)->toHaveCount(2);
});

test('updateAddress modifies an owned address', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $updated = $this->service->updateAddress($this->user, $address, [
        'city' => 'Karachi',
    ]);

    expect($updated->city)->toBe('Karachi');

    $this->assertDatabaseHas('addresses', [
        'id' => $address->id,
        'city' => 'Karachi',
    ]);
});

test('deleteAddress removes an owned address', function () {
    $address = Address::factory()->create(['user_id' => $this->user->id]);

    $this->service->deleteAddress($this->user, $address);

    $this->assertDatabaseMissing('addresses', ['id' => $address->id]);
});

// ─── Default address ──────────────────────────────────────────────────────

test('setDefaultAddress sets the address as default and clears others', function () {
    $first = Address::factory()->create(['user_id' => $this->user->id, 'is_default' => true]);
    $second = Address::factory()->create(['user_id' => $this->user->id, 'is_default' => false]);

    $this->service->setDefaultAddress($this->user, $second);

    expect($second->fresh()->is_default)->toBeTrue();
    expect($first->fresh()->is_default)->toBeFalse();
});

// ─── IDOR ──────────────────────────────────────────────────────────────────

test('updateAddress rejects when the address belongs to another user (IDOR)', function () {
    $address = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->expectException(ResourceNotFoundException::class);

    $this->service->updateAddress($this->user, $address, ['city' => 'Hack']);
});

test('deleteAddress rejects when the address belongs to another user (IDOR)', function () {
    $address = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->expectException(ResourceNotFoundException::class);

    $this->service->deleteAddress($this->user, $address);
});

test('setDefaultAddress rejects when the address belongs to another user (IDOR)', function () {
    $address = Address::factory()->create(['user_id' => $this->otherUser->id]);

    $this->expectException(ResourceNotFoundException::class);

    $this->service->setDefaultAddress($this->user, $address);
});
