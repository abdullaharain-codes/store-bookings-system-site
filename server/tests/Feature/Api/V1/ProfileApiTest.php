<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    // The "new password logs in" assertion drives a REAL /auth/login request,
    // which (like AuthTest) needs Origin/Referer so statefulApi() starts a
    // session. Harmless for the actingAs()-based tests.
    $this->withHeader('Origin', 'http://localhost:5173');
    $this->withHeader('Referer', 'http://localhost:5173/');

    $this->user = User::factory()->create([
        'name' => 'Original Name',
        'email' => 'customer@example.com',
        'password' => 'password123',
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Authorization ────────────────────────────────────────────────────────────

test('guest gets 401 on every profile endpoint', function () {
    $endpoints = [
        ['getJson', '/api/v1/profile', []],
        ['putJson', '/api/v1/profile', ['name' => 'X']],
        ['patchJson', '/api/v1/profile', ['name' => 'X']],
        ['postJson', '/api/v1/profile/password', []],
    ];

    foreach ($endpoints as [$method, $uri, $payload]) {
        $this->{$method}($uri, $payload)->assertStatus(401);
    }
});

// ─── Profile view + update ───────────────────────────────────────────────────

test('authenticated user can view their own profile', function () {
    $this->actingAs($this->user)
        ->getJson('/api/v1/profile')
        ->assertOk()
        ->assertJsonPath('user.id', $this->user->id)
        ->assertJsonPath('user.name', 'Original Name')
        ->assertJsonPath('user.email', 'customer@example.com')
        ->assertJsonPath('user.role.slug', 'customer');
});

test('authenticated user can update their name', function () {
    $this->actingAs($this->user)
        ->putJson('/api/v1/profile', ['name' => 'Renamed Customer'])
        ->assertOk()
        ->assertJsonPath('user.name', 'Renamed Customer')
        ->assertJsonPath('user.email', 'customer@example.com');

    expect($this->user->refresh()->name)->toBe('Renamed Customer');
});

test('PATCH applies a partial profile update', function () {
    $this->actingAs($this->user)
        ->patchJson('/api/v1/profile', ['name' => 'Partial Patch'])
        ->assertOk()
        ->assertJsonPath('user.name', 'Partial Patch');

    expect($this->user->refresh()->name)->toBe('Partial Patch');
});

test('email cannot be changed via the profile endpoint', function () {
    // Email is the login identifier and no verification flow exists, so it is
    // deliberately excluded from the profile update contract. Sending it has
    // no effect rather than silently reassigning the login credential.
    $this->actingAs($this->user)
        ->putJson('/api/v1/profile', [
            'name' => 'Still Here',
            'email' => 'takeover@example.com',
        ])
        ->assertOk()
        ->assertJsonPath('user.email', 'customer@example.com');

    expect($this->user->refresh()->email)->toBe('customer@example.com');
});

test('profile update rejects a name that is too long', function () {
    $this->actingAs($this->user)
        ->putJson('/api/v1/profile', ['name' => str_repeat('a', 256)])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

test('profile update rejects a name that is not a string', function () {
    $this->actingAs($this->user)
        ->putJson('/api/v1/profile', ['name' => ['nested', 'array']])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

// ─── Password change ─────────────────────────────────────────────────────────

test('password change succeeds and the new password works for a later login', function () {
    // Real session login with the OLD password (AuthTest precedent: no actingAs,
    // so Auth::attempt() in AuthController::login resolves the session "web"
    // guard). Origin/Referer are set in beforeEach so Sanctum applies the
    // stateful session here and on the protected /profile/password call below.
    $this->postJson('/api/v1/auth/login', [
        'email' => 'customer@example.com',
        'password' => 'password123',
    ])->assertOk();

    $this->postJson('/api/v1/profile/password', [
        'current_password' => 'password123',
        'new_password' => 'brandnewpass1',
        'new_password_confirmation' => 'brandnewpass1',
    ])->assertOk()
        ->assertJson(['message' => 'Password changed.']);

    // The stored hash now accepts the new password and rejects the old one.
    expect(Hash::check('brandnewpass1', $this->user->refresh()->password))->toBeTrue();
    expect(Hash::check('password123', $this->user->password))->toBeFalse();

    // The /profile/password call above ran behind auth:sanctum, whose
    // Authenticate middleware switches the app's default guard to 'sanctum'
    // (a RequestGuard). AuthController::login resolves Auth::attempt() on the
    // DEFAULT guard, so point it back at the session "web" guard before the
    // real login requests below — otherwise attempt() does not exist there.
    Auth::shouldUse('web');

    // Real subsequent login: new password works, old password no longer does.
    $this->postJson('/api/v1/auth/login', [
        'email' => 'customer@example.com',
        'password' => 'brandnewpass1',
    ])->assertOk();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'customer@example.com',
        'password' => 'password123',
    ])->assertStatus(401);
});

test('password change is rejected with the wrong current password', function () {
    $this->actingAs($this->user)
        ->postJson('/api/v1/profile/password', [
            'current_password' => 'wrong-password',
            'new_password' => 'brandnewpass1',
            'new_password_confirmation' => 'brandnewpass1',
        ])
        ->assertStatus(422)
        ->assertJsonPath('message', 'The current password is incorrect.');

    // The stored hash is untouched — the old password still works.
    expect(Hash::check('password123', $this->user->refresh()->password))->toBeTrue();
});

test('password change enforces the same strength rule as registration', function () {
    // min:8 — identical gate to RegisterRequest::baseRules.
    $this->actingAs($this->user)
        ->postJson('/api/v1/profile/password', [
            'current_password' => 'password123',
            'new_password' => 'short',
            'new_password_confirmation' => 'short',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['new_password']);
});

test('password change rejects a confirmation mismatch', function () {
    $this->actingAs($this->user)
        ->postJson('/api/v1/profile/password', [
            'current_password' => 'password123',
            'new_password' => 'brandnewpass1',
            'new_password_confirmation' => 'different-pass',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['new_password']);
});

test('password change is rejected without the current password', function () {
    $this->actingAs($this->user)
        ->postJson('/api/v1/profile/password', [
            'new_password' => 'brandnewpass1',
            'new_password_confirmation' => 'brandnewpass1',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['current_password']);
});
