<?php

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Modules\Users\Exceptions\UsersValidationException;
use App\Modules\Users\Services\ProfileService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(ProfileService::class);

    $this->user = User::factory()->create([
        'name' => 'Service Tester',
        'email' => 'tester@example.com',
        'password' => 'password123',
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    $this->actingAs($this->user);
});

// ─── Profile update ───────────────────────────────────────────────────────────

test('updateProfile applies the name and returns the profile with role', function () {
    $profile = $this->service->updateProfile($this->user, ['name' => 'New Name']);

    expect($this->user->refresh()->name)->toBe('New Name');
    expect($profile->role->slug)->toBe('customer');
});

test('updateProfile ignores keys that are not mutable profile fields', function () {
    $this->service->updateProfile($this->user, [
        'name' => 'Kept Name',
        'email' => 'tampered@example.com',
        'password' => 'tampered-pass-1',
    ]);

    $this->user->refresh();

    expect($this->user->name)->toBe('Kept Name');
    // Email is the login identifier and is deliberately outside the update
    // contract (no verification flow exists) — unscoped keys are never applied.
    expect($this->user->email)->toBe('tester@example.com');
    expect(Hash::check('password123', $this->user->password))->toBeTrue();
});

test('updateProfile with no mutable keys leaves the user untouched', function () {
    $this->service->updateProfile($this->user, []);

    expect($this->user->refresh()->name)->toBe('Service Tester');
});

// ─── Password change ─────────────────────────────────────────────────────────

test('changePassword rehashes and audit-logs the security-relevant action', function () {
    $this->service->changePassword($this->user, 'password123', 'freshpassword1');

    expect(Hash::check('freshpassword1', $this->user->refresh()->password))->toBeTrue();
    expect(Hash::check('password123', $this->user->password))->toBeFalse();

    $log = AuditLog::query()
        ->where('entity', 'User')
        ->where('entity_id', $this->user->id)
        ->where('action', 'password_changed')
        ->firstOrFail();

    expect($log->actor_id)->toBe($this->user->id);
    // The password itself must never be logged (rules.md §9).
    expect($log->metadata)->toBeNull();
});

test('changePassword throws when the current password is wrong and writes nothing', function () {
    expect(fn () => $this->service->changePassword($this->user, 'not-the-password', 'freshpassword1'))
        ->toThrow(UsersValidationException::class, 'The current password is incorrect.');

    expect(Hash::check('password123', $this->user->refresh()->password))->toBeTrue();
    expect(AuditLog::query()->where('action', 'password_changed')->count())->toBe(0);
});
