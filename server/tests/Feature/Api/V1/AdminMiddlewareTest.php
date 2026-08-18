<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class);
});

test('non-admin customer gets 403 on admin route', function () {
    $role = Role::where('slug', 'customer')->first();
    $user = User::factory()->create(['role_id' => $role->id]);

    $this->actingAs($user)
        ->getJson('/api/v1/admin/ping')
        ->assertStatus(403);
});

test('admin user gets 200 on admin route', function () {
    $role = Role::where('slug', 'admin')->first();
    $user = User::factory()->create(['role_id' => $role->id]);

    $this->actingAs($user)
        ->getJson('/api/v1/admin/ping')
        ->assertOk()
        ->assertJson(['ok' => true]);
});
