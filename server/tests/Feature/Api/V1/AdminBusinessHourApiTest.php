<?php

use App\Models\BusinessHour;
use App\Models\Role;
use App\Models\Service;
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

test('guest gets 401 on admin business hour endpoints', function () {
    $hour = BusinessHour::factory()->create(['day_of_week' => 1]);

    $this->getJson('/api/v1/admin/business-hours')->assertStatus(401);
    $this->postJson('/api/v1/admin/business-hours', [])->assertStatus(401);
    $this->getJson("/api/v1/admin/business-hours/{$hour->id}")->assertStatus(401);
    $this->putJson("/api/v1/admin/business-hours/{$hour->id}", [])->assertStatus(401);
    $this->deleteJson("/api/v1/admin/business-hours/{$hour->id}")->assertStatus(401);
});

test('customer gets 403 on admin business hour endpoints', function () {
    $hour = BusinessHour::factory()->create(['day_of_week' => 1]);

    $this->actingAs($this->customer)->getJson('/api/v1/admin/business-hours')->assertStatus(403);
    $this->actingAs($this->customer)->postJson('/api/v1/admin/business-hours', [])->assertStatus(403);
    $this->actingAs($this->customer)->getJson("/api/v1/admin/business-hours/{$hour->id}")->assertStatus(403);
    $this->actingAs($this->customer)->putJson("/api/v1/admin/business-hours/{$hour->id}", [])->assertStatus(403);
    $this->actingAs($this->customer)->deleteJson("/api/v1/admin/business-hours/{$hour->id}")->assertStatus(403);
});

test('admin can list business hours', function () {
    BusinessHour::factory()->create(['day_of_week' => 1, 'opens_at' => '09:00:00', 'closes_at' => '17:00:00']);
    BusinessHour::factory()->closed()->create(['day_of_week' => 0]);

    $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/business-hours');

    $response->assertOk()
        ->assertJsonStructure(['business_hours' => [['id', 'day_of_week', 'opens_at', 'closes_at', 'is_closed']]]);
    expect($response->json('business_hours'))->toHaveCount(2);
});

test('admin can create a business hour', function () {
    $response = $this->actingAs($this->admin)->postJson('/api/v1/admin/business-hours', [
        'day_of_week' => 2,
        'opens_at' => '09:00',
        'closes_at' => '18:00',
        'is_closed' => false,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('business_hour.day_of_week', 2)
        ->assertJsonPath('business_hour.is_closed', false);

    $this->assertDatabaseHas('business_hours', [
        'day_of_week' => 2,
        'is_closed' => false,
    ]);
});

test('admin can create a closed business hour', function () {
    $response = $this->actingAs($this->admin)->postJson('/api/v1/admin/business-hours', [
        'day_of_week' => 0,
        'is_closed' => true,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('business_hour.day_of_week', 0)
        ->assertJsonPath('business_hour.is_closed', true);

    $hour = BusinessHour::where('day_of_week', 0)->first();
    expect($hour->opens_at)->toBeNull();
    expect($hour->closes_at)->toBeNull();
});

test('admin can show, update, and delete a business hour', function () {
    $hour = BusinessHour::factory()->create(['day_of_week' => 3, 'opens_at' => '09:00:00', 'closes_at' => '17:00:00']);

    $this->actingAs($this->admin)
        ->getJson("/api/v1/admin/business-hours/{$hour->id}")
        ->assertOk()
        ->assertJsonPath('business_hour.id', $hour->id)
        ->assertJsonPath('business_hour.day_of_week', 3);

    $update = $this->actingAs($this->admin)->putJson("/api/v1/admin/business-hours/{$hour->id}", [
        'day_of_week' => 3,
        'opens_at' => '10:00',
        'closes_at' => '16:00',
        'is_closed' => false,
    ]);

    $update->assertOk()
        ->assertJsonPath('business_hour.opens_at', '10:00:00')
        ->assertJsonPath('business_hour.closes_at', '16:00:00');

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/business-hours/{$hour->id}")
        ->assertOk()
        ->assertJsonPath('message', 'Business hour deleted.');

    $this->assertDatabaseMissing('business_hours', ['id' => $hour->id]);
});

test('business hour validation rejects invalid payloads', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/business-hours', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['day_of_week', 'is_closed']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/business-hours', [
            'day_of_week' => 7,
            'opens_at' => '09:00',
            'closes_at' => '17:00',
            'is_closed' => false,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['day_of_week']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/business-hours', [
            'day_of_week' => 1,
            'opens_at' => '17:00',
            'closes_at' => '09:00',
            'is_closed' => false,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['closes_at']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/business-hours', [
            'day_of_week' => 1,
            'opens_at' => '9am',
            'closes_at' => '17:00',
            'is_closed' => false,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['opens_at']);
});

test('business hour duplicate day_of_week is rejected', function () {
    BusinessHour::factory()->create(['day_of_week' => 4]);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/business-hours', [
            'day_of_week' => 4,
            'opens_at' => '09:00',
            'closes_at' => '17:00',
            'is_closed' => false,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['day_of_week']);
});

test('business hour unknown id returns 404', function () {
    $this->actingAs($this->admin)->getJson('/api/v1/admin/business-hours/999999')->assertStatus(404);
    $this->actingAs($this->admin)->putJson('/api/v1/admin/business-hours/999999', [
        'day_of_week' => 1,
        'is_closed' => true,
    ])->assertStatus(404);
    $this->actingAs($this->admin)->deleteJson('/api/v1/admin/business-hours/999999')->assertStatus(404);
});

test('creating hours via API makes availability return slots', function () {
    $service = Service::factory()->create([
        'slug' => 'api-hours-service',
        'duration_minutes' => 60,
        'is_published' => true,
    ]);

    $date = now()->addDays(3);
    $dayOfWeek = (int) $date->dayOfWeek;

    $this->actingAs($this->admin)->postJson('/api/v1/admin/business-hours', [
        'day_of_week' => $dayOfWeek,
        'opens_at' => '09:00',
        'closes_at' => '11:00',
        'is_closed' => false,
    ])->assertStatus(201);

    $response = $this->getJson('/api/v1/services/api-hours-service/availability?date='.$date->toDateString());

    $response->assertOk();
    expect(count($response->json('slots')))->toBeGreaterThan(0);
});

test('business hour create, update, and delete write audit logs', function () {
    $create = $this->actingAs($this->admin)->postJson('/api/v1/admin/business-hours', [
        'day_of_week' => 5,
        'opens_at' => '09:00',
        'closes_at' => '17:00',
        'is_closed' => false,
    ])->assertStatus(201);

    $id = $create->json('business_hour.id');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'BusinessHour',
        'entity_id' => $id,
        'action' => 'created',
        'actor_id' => $this->admin->id,
    ]);

    $this->actingAs($this->admin)->putJson("/api/v1/admin/business-hours/{$id}", [
        'day_of_week' => 5,
        'opens_at' => '10:00',
        'closes_at' => '16:00',
        'is_closed' => false,
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'BusinessHour',
        'entity_id' => $id,
        'action' => 'updated',
        'actor_id' => $this->admin->id,
    ]);

    $this->actingAs($this->admin)->deleteJson("/api/v1/admin/business-hours/{$id}")->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'BusinessHour',
        'entity_id' => $id,
        'action' => 'deleted',
        'actor_id' => $this->admin->id,
    ]);
});
