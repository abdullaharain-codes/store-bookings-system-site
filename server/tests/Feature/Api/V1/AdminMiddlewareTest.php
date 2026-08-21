<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class);

    Route::middleware(['auth:sanctum', 'spa', 'admin'])
        ->get('/test/admin-ping', fn () => response()->json(['ok' => true]));
});

test('non-admin customer gets 403 on admin route', function () {
    $role = Role::where('slug', 'customer')->first();
    $user = User::factory()->create(['role_id' => $role->id]);

    $this->actingAs($user)
        ->getJson('/test/admin-ping')
        ->assertStatus(403);
});

test('admin user gets 200 on admin route', function () {
    $role = Role::where('slug', 'admin')->first();
    $user = User::factory()->create(['role_id' => $role->id]);

    $this->actingAs($user)
        ->getJson('/test/admin-ping')
        ->assertOk()
        ->assertJson(['ok' => true]);
});
