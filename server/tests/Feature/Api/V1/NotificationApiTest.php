<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->otherUser = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

function makeNotification(User $user, array $data = [], ?int $minutesFromNow = null): DatabaseNotification
{
    $attributes = [
        // The uuid PK is not auto-generated on direct relation-create (real
        // notifications get it from the send pipeline) — supply it like the
        // framework does via Str::uuid().
        'id' => (string) Str::uuid(),
        'type' => 'App\\Notifications\\TestNotification',
        'data' => $data === [] ? ['message' => 'Test notification'] : $data,
    ];

    if ($minutesFromNow !== null) {
        $attributes['created_at'] = now()->addMinutes($minutesFromNow);
    }

    return $user->notifications()->create($attributes);
}

// ─── Authorization ──────────────────────────────────────────────────────────

test('guest gets 401 on every notifications endpoint', function () {
    $this->getJson('/api/v1/notifications')->assertStatus(401);
    $this->postJson('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read')->assertStatus(401);
    $this->postJson('/api/v1/notifications/read-all')->assertStatus(401);
});

// ─── GET /notifications ─────────────────────────────────────────────────────

test('user gets an empty paginated list initially', function () {
    $this->actingAs($this->user)->getJson('/api/v1/notifications')
        ->assertOk()
        ->assertJsonStructure(['notifications' => ['data', 'links', 'total']])
        ->assertJsonPath('notifications.data', [])
        ->assertJsonPath('notifications.total', 0);
});

test('notifications are paginated, most-recent-first, and only the owners appear', function () {
    makeNotification($this->user, ['seq' => 1], 1);
    makeNotification($this->user, ['seq' => 2], 2);
    makeNotification($this->user, ['seq' => 3], 3);
    makeNotification($this->otherUser, ['seq' => 99], 4);

    $response = $this->actingAs($this->user)
        ->getJson('/api/v1/notifications?per_page=2');

    $response->assertOk()
        ->assertJsonPath('notifications.per_page', 2)
        ->assertJsonPath('notifications.total', 3)
        ->assertJsonPath('notifications.last_page', 2)
        ->assertJsonPath('notifications.from', 1)
        ->assertJsonPath('notifications.to', 2);

    $seqs = collect($response->json('notifications.data'))->pluck('data.seq')->all();

    expect($seqs)->toBe([3, 2]);
});

test('default notifications page size is 15', function () {
    foreach (range(1, 20) as $seq) {
        makeNotification($this->user, ['seq' => $seq]);
    }

    $this->actingAs($this->user)->getJson('/api/v1/notifications')
        ->assertOk()
        ->assertJsonPath('notifications.per_page', 15)
        ->assertJsonPath('notifications.total', 20);
});

// ─── POST /notifications/{id}/read ──────────────────────────────────────────

test('marking a notification read sets read_at and leaves others untouched', function () {
    $first = makeNotification($this->user, ['seq' => 1]);
    $second = makeNotification($this->user, ['seq' => 2]);

    $response = $this->actingAs($this->user)
        ->postJson("/api/v1/notifications/{$first->id}/read");

    $response->assertOk()
        ->assertJsonPath('notification.id', $first->id);

    expect($response->json('notification.read_at'))->not->toBeNull()
        ->and($first->refresh()->read_at)->toBeInstanceOf(Carbon::class)
        ->and($second->refresh()->read_at)->toBeNull();
});

test('a foreign-owned notification id responds id-identically to a missing one', function () {
    $foreign = makeNotification($this->otherUser, ['message' => 'SECRET OTHER USER CONTENT']);

    $foreignResponse = $this->actingAs($this->user)
        ->postJson("/api/v1/notifications/{$foreign->id}/read");

    $missingResponse = $this->actingAs($this->user)
        ->postJson('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read');

    $foreignResponse->assertStatus(404);
    $missingResponse->assertStatus(404);

    // Byte-identical bodies — the client cannot tell "belongs to someone
    // else" from "never existed", and the foreign data never leaks.
    expect($foreignResponse->json())->toBe($missingResponse->json())
        ->and($missingResponse->json())->toBe(['message' => 'Not Found'])
        ->and($foreign->refresh()->read_at)->toBeNull();
});

// ─── POST /notifications/read-all ───────────────────────────────────────────

test('read-all marks only the current users own unread notifications', function () {
    makeNotification($this->user);
    makeNotification($this->user);
    makeNotification($this->user);

    makeNotification($this->otherUser);
    makeNotification($this->otherUser);

    $alreadyRead = makeNotification($this->user);
    $alreadyRead->markAsRead();

    $this->actingAs($this->user)->postJson('/api/v1/notifications/read-all')
        ->assertOk()
        ->assertJsonPath('marked', 3);

    expect(DatabaseNotification::query()->where('notifiable_id', $this->user->id)->whereNull('read_at')->count())->toBe(0)
        ->and(DatabaseNotification::query()->where('notifiable_id', $this->otherUser->id)->whereNull('read_at')->count())->toBe(2);
});
