<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
    $this->withHeader('Origin', 'http://localhost:5173');
    $this->withHeader('Referer', 'http://localhost:5173/');
});

test('first request after login is not rejected by AuthenticateSession', function () {
    Auth::shouldUse('web');
    $user = User::factory()->create([
        'name' => 'Customer',
        'email' => 'customer@example.com',
        'password' => 'password123',
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'customer@example.com',
        'password' => 'password123',
    ])->assertOk();

    $this->getJson('/api/v1/profile')->assertOk();
});

test('unauthenticated cannot change password', function () {
    $this->postJson('/api/v1/profile/password', [
        'current_password' => 'password123',
        'new_password' => 'brandnewpass1',
        'new_password_confirmation' => 'brandnewpass1',
    ])->assertStatus(401);
});

test('wrong current password does not sign out other sessions', function () {
    Auth::shouldUse('web');
    $user = User::factory()->create([
        'name' => 'Customer',
        'email' => 'customer@example.com',
        'password' => 'password123',
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    $this->postJson('/api/v1/auth/login', ['email' => 'customer@example.com', 'password' => 'password123'])->assertOk();
    $this->postJson('/api/v1/auth/login', ['email' => 'customer@example.com', 'password' => 'password123'])->assertOk();

    $this->postJson('/api/v1/profile/password', [
        'current_password' => 'wrong-password',
        'new_password' => 'brandnewpass1',
        'new_password_confirmation' => 'brandnewpass1',
    ])->assertStatus(422);
});

test('validation failure does not sign out other sessions', function () {
    Auth::shouldUse('web');
    $user = User::factory()->create([
        'name' => 'Customer',
        'email' => 'customer@example.com',
        'password' => 'password123',
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    $this->postJson('/api/v1/auth/login', ['email' => 'customer@example.com', 'password' => 'password123'])->assertOk();
    $this->postJson('/api/v1/auth/login', ['email' => 'customer@example.com', 'password' => 'password123'])->assertOk();

    $this->postJson('/api/v1/profile/password', [
        'current_password' => 'password123',
        'new_password' => 'short',
        'new_password_confirmation' => 'short',
    ])->assertStatus(422);
});
