<?php

use App\Models\User;
use App\Shared\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->logger = app(AuditLogger::class);
});

test('log records the authenticated user as actor', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $entry = $this->logger->log('Category', 42, 'published', ['reason' => 'launch']);

    expect($entry->exists)->toBeTrue();
    expect($entry->entity)->toBe('Category');
    expect((int) $entry->entity_id)->toBe(42);
    expect($entry->action)->toBe('published');
    expect($entry->actor_id)->toBe($user->id);
    expect($entry->metadata)->toBe(['reason' => 'launch']);

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Category',
        'entity_id' => 42,
        'action' => 'published',
        'actor_id' => $user->id,
    ]);
});

test('log records null actor when called from system context (no authenticated user)', function () {
    $entry = $this->logger->log('Brand', 7, 'unpublished');

    expect($entry->actor_id)->toBeNull();
    expect($entry->metadata)->toBeNull();

    $this->assertDatabaseHas('audit_logs', [
        'entity' => 'Brand',
        'entity_id' => 7,
        'action' => 'unpublished',
        'actor_id' => null,
    ]);
});
