<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    // NOTE: Origin/Referer are NOT set globally here. statefulApi() treats any
    // request carrying those headers as a session-cookie SPA call, which
    // enables Sanctum's AuthenticateSession middleware: it pins the current
    // user's password-hash in the session and THROWS 401 the first time a
    // DIFFERENT actingAs() user makes a request (hash mismatch = forced
    // logout). The review/password-change tests here deliberately switch
    // users mid-test to prove the per-USER limiter key, so those requests must
    // stay non-stateful. Only register() depends on a session (it calls
    // session()->regenerate()), so only that test sets the headers locally.

    // Customer role needed by every actingAs() user on the throttled routes.
    $this->customerRole = Role::where('slug', 'customer')->first()->id;
});

// The array cache store is fresh per test app instance, so limiter state
// already cannot bleed between tests — this flush is belt-and-braces against
// any future CACHE_STORE change in phpunit.xml.
afterEach(function () {
    Cache::flush();
});

// ─── Login — compound email+IP key ────────────────────────────────────────────

test('login throttles at the 6th attempt per minute for the same email and IP', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'victim@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(401);
    }

    $this->postJson('/api/v1/auth/login', [
        'email' => 'victim@example.com',
        'password' => 'wrong-password',
    ])->assertStatus(429);
});

test('a different email from the same IP is still allowed during a login lock', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'victim@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(401);
    }

    // The victim's compound key (email+IP) is now exhausted...
    $this->postJson('/api/v1/auth/login', [
        'email' => 'victim@example.com',
        'password' => 'wrong-password',
    ])->assertStatus(429);

    // ...but the IP is NOT blacklisted: another email from the same IP gets a
    // normal 401 (invalid creds), never a 429. One attacker cannot lock out a
    // whole shared-IP office (and rotating IPs cannot dodge the victim's key).
    $this->postJson('/api/v1/auth/login', [
        'email' => 'different@example.com',
        'password' => 'wrong-password',
    ])->assertStatus(401);
});

// ─── Register — per-IP key ────────────────────────────────────────────────────

test('register throttles at the 6th attempt per minute per IP', function () {
    // register() regenerates the session (session()->regenerate()), so these
    // requests must be stateful — the one place this file sets Origin/Referer
    // (see beforeEach note). No in-test user switch happens here, so the
    // AuthenticateSession user-switch 401 quirk cannot trigger.
    $this->withHeader('Origin', 'http://localhost:5173');
    $this->withHeader('Referer', 'http://localhost:5173/');

    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Rate Test',
            'email' => "rate{$i}@example.com",
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'gender' => 'male',
        ])->assertStatus(201);
    }

    // Even a brand-new, never-seen email from this IP is throttled once the
    // IP's 5/minute allowance is spent.
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Rate Test',
        'email' => 'ratelimited@example.com',
        'password' => 'password123',
        'password_confirmation' => 'password123',
        'gender' => 'male',
    ])->assertStatus(429);
});

// ─── Review submission — per-authenticated-user key ───────────────────────────

test('review submission throttles at the 11th attempt per minute per user', function () {
    $user = User::factory()->create(['role_id' => $this->customerRole]);

    // All 10 legitimate attempts reach the controller (each rejected on
    // eligibility here, but counted): none is a 429.
    for ($i = 0; $i < 10; $i++) {
        $this->actingAs($user)->postJson('/api/v1/reviews', [
            'product_id' => 999,
            'rating' => 5,
        ])->assertStatus(422);
    }

    $this->actingAs($user)->postJson('/api/v1/reviews', [
        'product_id' => 999,
        'rating' => 5,
    ])->assertStatus(429);
});

test('a review attempt by a different user in the same window is still allowed', function () {
    $user = User::factory()->create(['role_id' => $this->customerRole]);

    for ($i = 0; $i < 10; $i++) {
        $this->actingAs($user)->postJson('/api/v1/reviews', [
            'product_id' => 999,
            'rating' => 5,
        ])->assertStatus(422);
    }

    $this->actingAs($user)->postJson('/api/v1/reviews', [
        'product_id' => 999,
        'rating' => 5,
    ])->assertStatus(429);

    // The per-USER key means a second account is untouched.
    $other = User::factory()->create(['role_id' => $this->customerRole]);

    $this->actingAs($other)->postJson('/api/v1/reviews', [
        'product_id' => 999,
        'rating' => 5,
    ])->assertStatus(422);
});

// ─── Password change — per-authenticated-user key ─────────────────────────────

test('password change throttles at the 6th attempt per minute per user', function () {
    $user = User::factory()->create([
        'role_id' => $this->customerRole,
        'password' => 'password123',
    ]);

    for ($i = 0; $i < 5; $i++) {
        $this->actingAs($user)->postJson('/api/v1/profile/password', [
            'current_password' => 'wrong-password',
            'new_password' => 'brandnewpass1',
            'new_password_confirmation' => 'brandnewpass1',
        ])->assertStatus(422);
    }

    $this->actingAs($user)->postJson('/api/v1/profile/password', [
        'current_password' => 'wrong-password',
        'new_password' => 'brandnewpass1',
        'new_password_confirmation' => 'brandnewpass1',
    ])->assertStatus(429);
});

test('password change by a different user in the same window is still allowed', function () {
    $user = User::factory()->create([
        'role_id' => $this->customerRole,
        'password' => 'password123',
    ]);

    for ($i = 0; $i < 5; $i++) {
        $this->actingAs($user)->postJson('/api/v1/profile/password', [
            'current_password' => 'wrong-password',
            'new_password' => 'brandnewpass1',
            'new_password_confirmation' => 'brandnewpass1',
        ])->assertStatus(422);
    }

    $this->actingAs($user)->postJson('/api/v1/profile/password', [
        'current_password' => 'wrong-password',
        'new_password' => 'brandnewpass1',
        'new_password_confirmation' => 'brandnewpass1',
    ])->assertStatus(429);

    $other = User::factory()->create([
        'role_id' => $this->customerRole,
        'password' => 'password123',
    ]);

    $this->actingAs($other)->postJson('/api/v1/profile/password', [
        'current_password' => 'wrong-password',
        'new_password' => 'brandnewpass1',
        'new_password_confirmation' => 'brandnewpass1',
    ])->assertStatus(422);
});
