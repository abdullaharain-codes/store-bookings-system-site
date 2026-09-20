<?php

/**
 * Regression test: real cookie-based session flow (NOT actingAs).
 *
 * This test drives the same flow a real SPA browser client uses:
 *   1. GET /sanctum/csrf-cookie (sets session + XSRF-TOKEN cookies)
 *   2. POST /auth/login (with XSRF-TOKEN header + cookies)
 *   3. GET /auth/user (verify session persists)
 *   4. GET /cart (verify session survives into protected routes)
 *
 * Bug caught: when route middleware was ['auth:sanctum', 'spa'] (sanctum
 * before session-starting spa group), auth:sanctum ran before StartSession,
 * so the session was empty → 401 for all protected routes despite valid
 * login.  Tests using actingAs() never hit this because actingAs() bypasses
 * the middleware pipeline entirely.
 *
 * Fix: session middleware now runs exactly once, provided by statefulApi()'s
 * EnsureFrontendRequestsAreStateful on the api group (no route-level 'spa'
 * group). Legacy swap-to-['spa','auth:sanctum'] note superseded.
 *
 * @see bootstrap/app.php statefulApi(); routes/api.php
 */

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    // statefulApi()'s EnsureFrontendRequestsAreStateful only starts the
    // session for whitelisted-origin requests. Simulate a real browser from
    // the SANCTUM_STATEFUL_DOMAINS origin so the cookie flow exercises the
    // exact same code path a production SPA does.
    $this->withHeader('Origin', 'http://localhost:5173');
    $this->withHeader('Referer', 'http://localhost:5173/');
});

test('real cookie session flow: login then access protected route without actingAs', function () {
    // Arrange: create a customer user directly in DB.
    $user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    // Step 1: Fetch CSRF cookie — sets session cookie + XSRF-TOKEN cookie.
    $csrfResponse = $this->getJson('/sanctum/csrf-cookie');
    $csrfResponse->assertStatus(204);

    // Extract XSRF-TOKEN from the response cookies.
    $token = null;
    foreach ($csrfResponse->headers->getCookies() as $cookie) {
        if ($cookie->getName() === 'XSRF-TOKEN') {
            $token = $cookie->getValue();
            break;
        }
    }
    // Fallback: session token is the XSRF token in Laravel's SPA setup.
    $token = $token ?? $this->app['session.store']->token();
    expect($token)->not->toBeNull();

    // Step 2: Login with real credentials + XSRF-TOKEN header.
    $loginResponse = $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ], [
        'X-XSRF-TOKEN' => $token,
    ]);
    $loginResponse->assertOk();

    // Step 3: Verify session persists — GET /auth/user should return the user.
    $userResponse = $this->getJson('/api/v1/auth/user');
    $userResponse->assertOk()
        ->assertJsonPath('user.email', $user->email);

    // Step 4: THE CRITICAL CHECK — protected route via real session (no actingAs).
    // Before the fix, this returned 401 because auth:sanctum ran before
    // StartSession, so the session was empty.
    $cartResponse = $this->getJson('/api/v1/cart');
    $cartResponse->assertOk()
        ->assertJsonStructure(['cart' => ['id', 'items']]);
});

test('real cookie session flow: admin can access admin routes via session', function () {
    $admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);

    // Fetch CSRF cookie.
    $csrfResponse = $this->getJson('/sanctum/csrf-cookie');
    $csrfResponse->assertStatus(204);

    // Extract XSRF token.
    $token = null;
    foreach ($csrfResponse->headers->getCookies() as $cookie) {
        if ($cookie->getName() === 'XSRF-TOKEN') {
            $token = $cookie->getValue();
            break;
        }
    }
    $token = $token ?? $this->app['session.store']->token();

    // Login as admin.
    $this->postJson('/api/v1/auth/login', [
        'email' => $admin->email,
        'password' => 'password',
    ], [
        'X-XSRF-TOKEN' => $token,
    ])->assertOk();

    // Verify user.
    $this->getJson('/api/v1/auth/user')
        ->assertOk()
        ->assertJsonPath('user.email', $admin->email);

    // Admin route via real session — was 401 before the fix.
    $this->getJson('/api/v1/admin/orders')
        ->assertOk()
        ->assertJsonStructure(['orders']);
});
