<?php

use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
    $this->withHeader('Origin', 'http://localhost:5173');
    $this->withHeader('Referer', 'http://localhost:5173/');
});

it('registers a user with a valid gender and returns it', function (string $gender) {
    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Test User',
        'email' => 'test@example.test',
        'password' => 'password123',
        'password_confirmation' => 'password123',
        'gender' => $gender,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('user.gender', $gender);

    $this->assertDatabaseHas('users', [
        'email' => 'test@example.test',
        'gender' => $gender,
    ]);
})->with(['male', 'female', 'other']);

it('rejects registration without gender', function () {
    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Test User',
        'email' => 'test@example.test',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['gender']);
});

it('rejects registration with invalid gender', function () {
    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Test User',
        'email' => 'test@example.test',
        'password' => 'password123',
        'password_confirmation' => 'password123',
        'gender' => 'invalid',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['gender']);
});

it('returns gender in auth user response', function () {
    $user = User::factory()->create(['gender' => 'female']);

    $response = $this->actingAs($user)->getJson('/api/v1/auth/user');

    $response->assertOk()
        ->assertJsonPath('user.gender', 'female');
});

it('updates profile gender with valid value', function (string $gender) {
    $user = User::factory()->create(['gender' => 'male']);

    $response = $this->actingAs($user)->patchJson('/api/v1/profile', [
        'gender' => $gender,
    ]);

    $response->assertOk()
        ->assertJsonPath('user.gender', $gender);

    $this->assertDatabaseHas('users', [
        'id' => $user->id,
        'gender' => $gender,
    ]);
})->with(['male', 'female', 'other']);

it('rejects profile gender update with invalid value', function () {
    $user = User::factory()->create(['gender' => 'male']);

    $response = $this->actingAs($user)->patchJson('/api/v1/profile', [
        'gender' => 'bad',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['gender']);

    $this->assertDatabaseHas('users', [
        'id' => $user->id,
        'gender' => 'male',
    ]);
});

it('leaves gender unchanged when profile update only changes name', function () {
    $user = User::factory()->create(['name' => 'Old Name', 'gender' => 'female']);

    $response = $this->actingAs($user)->patchJson('/api/v1/profile', [
        'name' => 'New Name',
    ]);

    $response->assertOk()
        ->assertJsonPath('user.name', 'New Name')
        ->assertJsonPath('user.gender', 'female');

    $this->assertDatabaseHas('users', [
        'id' => $user->id,
        'name' => 'New Name',
        'gender' => 'female',
    ]);
});

it('rejects profile gender null because gender cannot be cleared', function () {
    $user = User::factory()->create(['gender' => 'male']);

    $response = $this->actingAs($user)->patchJson('/api/v1/profile', [
        'gender' => null,
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['gender']);
});
