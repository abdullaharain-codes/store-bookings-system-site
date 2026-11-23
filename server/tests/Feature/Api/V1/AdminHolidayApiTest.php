<?php

use App\Models\BusinessHour;
use App\Models\Holiday;
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

test('guest gets 401 on admin holiday endpoints', function () {
    $holiday = Holiday::factory()->create(['date' => '2026-12-25']);

    $this->getJson('/api/v1/admin/holidays')->assertStatus(401);
    $this->postJson('/api/v1/admin/holidays', [])->assertStatus(401);
    $this->getJson("/api/v1/admin/holidays/{$holiday->id}")->assertStatus(401);
    $this->putJson("/api/v1/admin/holidays/{$holiday->id}", [])->assertStatus(401);
    $this->deleteJson("/api/v1/admin/holidays/{$holiday->id}")->assertStatus(401);
});

test('customer gets 403 on admin holiday endpoints', function () {
    $holiday = Holiday::factory()->create(['date' => '2026-12-25']);

    $this->actingAs($this->customer)->getJson('/api/v1/admin/holidays')->assertStatus(403);
    $this->actingAs($this->customer)->postJson('/api/v1/admin/holidays', [])->assertStatus(403);
    $this->actingAs($this->customer)->getJson("/api/v1/admin/holidays/{$holiday->id}")->assertStatus(403);
    $this->actingAs($this->customer)->putJson("/api/v1/admin/holidays/{$holiday->id}", [])->assertStatus(403);
    $this->actingAs($this->customer)->deleteJson("/api/v1/admin/holidays/{$holiday->id}")->assertStatus(403);
});

test('admin can list holidays', function () {
    Holiday::factory()->create(['date' => '2026-12-25', 'reason' => 'Christmas']);
    Holiday::factory()->create(['date' => '2026-12-31', 'reason' => 'Year End']);

    $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/holidays');

    $response->assertOk()
        ->assertJsonStructure(['holidays' => [['id', 'date', 'reason']]]);
    expect($response->json('holidays'))->toHaveCount(2);
});

test('admin can create, show, update, and delete a holiday', function () {
    $create = $this->actingAs($this->admin)->postJson('/api/v1/admin/holidays', [
        'date' => '2027-01-01',
        'reason' => 'New Year',
    ]);

    $create->assertStatus(201)
        ->assertJsonPath('holiday.date', '2027-01-01')
        ->assertJsonPath('holiday.reason', 'New Year');

    $id = $create->json('holiday.id');

    $this->actingAs($this->admin)
        ->getJson("/api/v1/admin/holidays/{$id}")
        ->assertOk()
        ->assertJsonPath('holiday.id', $id)
        ->assertJsonPath('holiday.date', '2027-01-01');

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/holidays/{$id}", [
            'date' => '2027-01-02',
            'reason' => 'Moved Holiday',
        ])
        ->assertOk()
        ->assertJsonPath('holiday.date', '2027-01-02')
        ->assertJsonPath('holiday.reason', 'Moved Holiday');

    $list = $this->actingAs($this->admin)->getJson('/api/v1/admin/holidays');
    $list->assertOk();
    expect($list->json('holidays.0.date'))->toBe('2027-01-02');

    $this->actingAs($this->admin)
        ->deleteJson("/api/v1/admin/holidays/{$id}")
        ->assertOk()
        ->assertJsonPath('message', 'Holiday deleted.');

    $this->assertDatabaseMissing('holidays', ['id' => $id]);
});

test('holiday validation rejects invalid payloads', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/holidays', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/holidays', [
            'date' => 'not-a-date',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/holidays', [
            'date' => '2027/01/01',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date']);
});

test('holiday duplicate date is rejected', function () {
    Holiday::factory()->create(['date' => '2027-03-23']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/holidays', [
            'date' => '2027-03-23',
            'reason' => 'Duplicate',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date']);
});

test('holiday unknown id returns 404', function () {
    $this->actingAs($this->admin)->getJson('/api/v1/admin/holidays/999999')->assertStatus(404);
    $this->actingAs($this->admin)->putJson('/api/v1/admin/holidays/999999', ['date' => '2027-01-01'])->assertStatus(404);
    $this->actingAs($this->admin)->deleteJson('/api/v1/admin/holidays/999999')->assertStatus(404);
});

test('holiday created via API removes slots for that date', function () {
    $service = Service::factory()->create([
        'slug' => 'api-holiday-service',
        'duration_minutes' => 60,
        'is_published' => true,
    ]);

    $date = now()->addDays(4);
    $dayOfWeek = (int) $date->dayOfWeek;

    BusinessHour::factory()->create([
        'day_of_week' => $dayOfWeek,
        'opens_at' => '09:00:00',
        'closes_at' => '11:00:00',
        'is_closed' => false,
    ]);

    $before = $this->getJson('/api/v1/services/api-holiday-service/availability?date='.$date->toDateString());
    $before->assertOk();
    expect(count($before->json('slots')))->toBeGreaterThan(0);

    $this->actingAs($this->admin)->postJson('/api/v1/admin/holidays', [
        'date' => $date->toDateString(),
        'reason' => 'Test Holiday',
    ])->assertStatus(201);

    $after = $this->getJson('/api/v1/services/api-holiday-service/availability?date='.$date->toDateString());
    $after->assertOk();
    expect($after->json('slots'))->toBe([]);
});

test('holiday update keeping same date and changing reason returns 200', function () {
    $holiday = Holiday::factory()->create(['date' => '2027-05-01', 'reason' => 'Old']);

    $this->actingAs($this->admin)
        ->putJson("/api/v1/admin/holidays/{$holiday->id}", [
            'date' => '2027-05-01',
            'reason' => 'New Reason',
        ])
        ->assertOk()
        ->assertJsonPath('holiday.date', '2027-05-01')
        ->assertJsonPath('holiday.reason', 'New Reason');
});

test('holiday date with whitespace or datetime string is rejected', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/holidays', [
            'date' => ' 2027-01-01 ',
            'reason' => 'Whitespace',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date']);

    $this->actingAs($this->admin)
        ->postJson('/api/v1/admin/holidays', [
            'date' => '2027-01-01 00:00:00',
            'reason' => 'Datetime',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date']);
});

test('holiday create, update, and delete write audit logs', function () {
    $create = $this->actingAs($this->admin)->postJson('/api/v1/admin/holidays', [
        'date' => '2027-06-01',
        'reason' => 'Audit Holiday',
    ])->assertStatus(201);

    $id = $create->json('holiday.id');

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Holiday',
        'entity_id' => $id,
        'action' => 'created',
        'actor_id' => $this->admin->id,
    ]);

    $this->actingAs($this->admin)->putJson("/api/v1/admin/holidays/{$id}", [
        'date' => '2027-06-02',
        'reason' => 'Audit Holiday Updated',
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Holiday',
        'entity_id' => $id,
        'action' => 'updated',
        'actor_id' => $this->admin->id,
    ]);

    $this->actingAs($this->admin)->deleteJson("/api/v1/admin/holidays/{$id}")->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Holiday',
        'entity_id' => $id,
        'action' => 'deleted',
        'actor_id' => $this->admin->id,
    ]);
});
