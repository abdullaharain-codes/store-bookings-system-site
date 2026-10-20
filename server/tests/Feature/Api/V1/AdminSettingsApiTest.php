<?php

use App\Models\AuditLog;
use App\Models\BusinessSetting;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

// ─── Authorization ────────────────────────────────────────────────────────────

test('guest gets 401 on every admin settings endpoint', function () {
    $this->getJson('/api/v1/admin/settings')->assertStatus(401);
    $this->getJson('/api/v1/admin/settings/email_notifications_enabled')->assertStatus(401);
    $this->patchJson('/api/v1/admin/settings/email_notifications_enabled', ['value' => false])->assertStatus(401);
});

test('customer gets 403 on every admin settings endpoint', function () {
    $this->actingAs($this->customer)->getJson('/api/v1/admin/settings')->assertStatus(403);
    $this->actingAs($this->customer)->getJson('/api/v1/admin/settings/email_notifications_enabled')->assertStatus(403);
    $this->actingAs($this->customer)->patchJson('/api/v1/admin/settings/email_notifications_enabled', ['value' => false])->assertStatus(403);
});

// ─── Admin reads ──────────────────────────────────────────────────────────────

test('admin can list all settings with their types and canonical values', function () {
    $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/settings');

    $response->assertOk();

    $settings = collect($response->json('settings'))->keyBy('key');

    expect($settings['email_notifications_enabled'])->not->toBeNull()
        ->and($settings['email_notifications_enabled']['value'])->toBe('1')
        ->and($settings['email_notifications_enabled']['type'])->toBe('boolean')
        ->and($settings['cart_hold_minutes']['type'])->toBe('integer')
        ->and($settings['shipping_fee']['value'])->toBe('200');
});

test('admin can read a single setting by key', function () {
    $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/settings/email_notifications_enabled')
        ->assertOk()
        ->assertJsonPath('setting.key', 'email_notifications_enabled')
        ->assertJsonPath('setting.value', '1')
        ->assertJsonPath('setting.type', 'boolean');
});

test('admin update of email_notifications_enabled is persisted and audit-logged', function () {
    $response = $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/email_notifications_enabled', ['value' => false]);

    $response->assertOk()
        ->assertJsonPath('setting.key', 'email_notifications_enabled')
        ->assertJsonPath('setting.value', '0');

    $row = BusinessSetting::where('key', 'email_notifications_enabled')->first();

    expect($row->value)->toBe('0')
        ->and($row->updated_by)->toBe($this->admin->id);

    $log = AuditLog::where('entity', 'BusinessSetting')
        ->where('entity_id', $row->id)
        ->where('action', 'updated')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->actor_id)->toBe($this->admin->id)
        ->and($log->metadata['key'])->toBe('email_notifications_enabled')
        ->and($log->metadata['before'])->toBe('1')
        ->and($log->metadata['after'])->toBe('0');
});

// ─── Validation / 404 ─────────────────────────────────────────────────────────

test('a non-boolean value for a boolean setting is rejected, not coerced', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/email_notifications_enabled', ['value' => 'maybe'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    expect(BusinessSetting::where('key', 'email_notifications_enabled')->value('value'))->toBe('1');
});

test('a non-integer value for an integer setting is rejected, not coerced', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/cart_hold_minutes', ['value' => 'not-a-number'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    expect(BusinessSetting::where('key', 'cart_hold_minutes')->value('value'))->toBe('15');
});

test('reading or updating a nonexistent setting key returns 404', function () {
    $this->actingAs($this->admin)
        ->getJson('/api/v1/admin/settings/does_not_exist')
        ->assertStatus(404)
        ->assertJson(['message' => 'Not Found']);

    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/does_not_exist', ['value' => 'x'])
        ->assertStatus(404)
        ->assertJson(['message' => 'Not Found']);
});

// ─── Money-type settings (B4-1c) ─────────────────────────────────────────────
//
// shipping_fee is seeded with type 'string' (see the seed migration), so the
// generic per-type rule would accept ANY string ('abc', '-5', '1.999'). These
// fix that with a per-key money rule and are the RED-first contract for it.

test('a non-numeric shipping_fee is rejected, not stored', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => 'abc'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    expect(BusinessSetting::where('key', 'shipping_fee')->value('value'))->toBe('200');
});

test('a negative shipping_fee is rejected', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => '-5'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    expect(BusinessSetting::where('key', 'shipping_fee')->value('value'))->toBe('200');
});

test('a shipping_fee with more than two decimals is rejected', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => '1.999'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    expect(BusinessSetting::where('key', 'shipping_fee')->value('value'))->toBe('200');
});

test('a valid shipping_fee with two decimals is accepted and persisted', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => '149.99'])
        ->assertOk()
        ->assertJsonPath('setting.value', '149.99');

    expect(BusinessSetting::where('key', 'shipping_fee')->value('value'))->toBe('149.99');
});

test('a whole-number shipping_fee is accepted', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => '250'])
        ->assertOk()
        ->assertJsonPath('setting.value', '250');
});

test('the shipping fee endpoint serves the value just saved by the admin', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/shipping_fee', ['value' => '175.50'])
        ->assertOk();

    $this->getJson('/api/v1/shipping-fee')
        ->assertOk()
        ->assertJson(['shipping_fee' => '175.50']);
});
