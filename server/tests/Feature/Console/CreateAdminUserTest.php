<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

uses(RefreshDatabase::class);

beforeEach(function () {
    // The admin role is seeded by the first migration; confirm it's present
    // so the factory state doesn't silently bypass the missing-role path.
    $this->adminRoleId = Role::where('slug', 'admin')->first()->id;
});

it('creates a user with admin role when given valid flags', function () {
    $this->artisan('admin:create', [
        '--name' => 'Test Admin',
        '--email' => 'admin@example.test',
        '--password' => 'secret1234',
    ])
        ->assertExitCode(0)
        ->expectsOutputToContain('Admin user created: admin@example.test');

    $this->assertDatabaseHas('users', [
        'email' => 'admin@example.test',
        'role_id' => $this->adminRoleId,
    ]);

    $user = User::where('email', 'admin@example.test')->first();
    // Password is never printed or logged — the command only outputs the
    // success line with the email address (verified by code inspection).
    expect(Hash::check('secret1234', $user->password))->toBeTrue();
});

it('rejects a duplicate email with a non-zero exit code', function () {
    User::factory()->create(['email' => 'existing@test.dev']);

    $this->artisan('admin:create', [
        '--name' => 'Dupe Admin',
        '--email' => 'existing@test.dev',
        '--password' => 'secret1234',
    ])
        ->assertExitCode(1);

    expect(User::where('email', 'existing@test.dev')->count())->toBe(1);
});

it('fails clearly when the admin role is missing from the database', function () {
    Log::shouldReceive('critical')->once();

    Role::query()->where('slug', 'admin')->delete();

    $this->artisan('admin:create', [
        '--name' => 'Orphan Admin',
        '--email' => 'orphan@test.dev',
        '--password' => 'secret1234',
    ])
        ->assertExitCode(1)
        ->expectsOutputToContain('admin" role is missing');

    $this->assertDatabaseMissing('users', ['email' => 'orphan@test.dev']);
});

it('rejects a weak password below the minimum length', function () {
    $this->artisan('admin:create', [
        '--name' => 'Weak Admin',
        '--email' => 'weak@test.dev',
        '--password' => 'short',
    ])
        ->assertExitCode(1);

    $this->assertDatabaseMissing('users', ['email' => 'weak@test.dev']);
});

it('prompts interactively when options are omitted', function () {
    $this->artisan('admin:create')
        ->expectsQuestion('Admin name', 'Prompt Admin')
        ->expectsQuestion('Admin email', 'prompt@test.dev')
        ->expectsQuestion('Admin password', 'secret1234')
        ->assertExitCode(0);

    $this->assertDatabaseHas('users', [
        'email' => 'prompt@test.dev',
        'role_id' => $this->adminRoleId,
    ]);
});
