<?php

use App\Models\AuditLog;
use App\Models\Service;
use App\Models\User;
use App\Modules\Services\Exceptions\ServiceValidationException;
use App\Modules\Services\Services\ServiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(ServiceService::class);
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

// ─── Slug handling ───────────────────────────────────────────────────────────

test('create generates slug automatically from name', function () {
    $service = $this->service->createService([
        'name' => 'Virus & Malware Removal',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);

    expect($service->slug)->toBe('virus-malware-removal');
});

test('create appends numeric suffixes on auto-generated slug collision', function () {
    $base = [
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ];
    $first = $this->service->createService(['name' => 'PC Repair'] + $base);
    $second = $this->service->createService(['name' => 'PC Repair'] + $base);
    $third = $this->service->createService(['name' => 'PC Repair'] + $base);

    expect($first->slug)->toBe('pc-repair');
    expect($second->slug)->toBe('pc-repair-2');
    expect($third->slug)->toBe('pc-repair-3');
});

test('create throws when an explicitly provided slug is already taken', function () {
    $this->service->createService([
        'name' => 'Existing Service',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);

    expect(fn () => $this->service->createService([
        'name' => 'Other Service',
        'slug' => 'existing-service',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]))->toThrow(ServiceValidationException::class);
});

test('update accepts the service keeping its own slug (excludes self)', function () {
    $service = $this->service->createService([
        'name' => 'Alpha',
        'slug' => 'alpha',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);
    $this->service->createService([
        'name' => 'Beta',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);

    $updated = $this->service->updateService($service, ['name' => 'Alpha Renamed', 'slug' => 'alpha']);

    expect($updated->refresh()->slug)->toBe('alpha');
});

// ─── Price range rule (PRD §10) ──────────────────────────────────────────────

test('create rejects price_min greater than price_max', function () {
    expect(fn () => $this->service->createService([
        'name' => 'Overpriced',
        'price_min' => 9000,
        'price_max' => 1000,
        'duration_minutes' => 60,
    ]))->toThrow(ServiceValidationException::class);
});

test('create rejects price_min greater than price_max with a clear message', function () {
    expect(fn () => $this->service->createService([
        'name' => 'Overpriced',
        'price_min' => 9000,
        'price_max' => 1000,
        'duration_minutes' => 60,
    ]))->toThrow('price_min must be less than or equal to price_max');
});

test('create accepts an equal price_min and price_max (boundary allowed)', function () {
    $service = $this->service->createService([
        'name' => 'Fixed Price',
        'price_min' => 5000,
        'price_max' => 5000,
        'duration_minutes' => 45,
    ]);

    expect((float) $service->price_min)->toBe(5000.0);
    expect((float) $service->price_max)->toBe(5000.0);
});

test('valid create persists the full service payload', function () {
    $service = $this->service->createService([
        'name' => 'SSD Upgrade',
        'description' => 'Clone and fit an SSD.',
        'price_min' => 2000,
        'price_max' => 6000,
        'duration_minutes' => 120,
        'is_published' => true,
    ]);

    expect($service->refresh())
        ->name->toBe('SSD Upgrade')
        ->description->toBe('Clone and fit an SSD.')
        ->duration_minutes->toBe(120)
        ->is_published->toBeTrue();
    expect((float) $service->price_min)->toBe(2000.0);
    expect((float) $service->price_max)->toBe(6000.0);
});

test('update rejects a price_min above the stored price_max', function () {
    $service = $this->service->createService([
        'name' => 'Range',
        'price_min' => 1000,
        'price_max' => 4000,
        'duration_minutes' => 60,
    ]);

    expect(fn () => $this->service->updateService($service, [
        'price_min' => 5000,
    ]))->toThrow(ServiceValidationException::class);
});

test('update rejects lowering price_max below the stored price_min', function () {
    $service = $this->service->createService([
        'name' => 'Range',
        'price_min' => 3000,
        'price_max' => 6000,
        'duration_minutes' => 60,
    ]);

    expect(fn () => $this->service->updateService($service, [
        'price_max' => 2500,
    ]))->toThrow(ServiceValidationException::class);
});

test('update accepts a legitimate price change', function () {
    $service = $this->service->createService([
        'name' => 'Range',
        'price_min' => 1000,
        'price_max' => 4000,
        'duration_minutes' => 60,
    ]);

    $updated = $this->service->updateService($service, [
        'price_min' => 2000,
        'price_max' => 5000,
    ]);

    expect((float) $updated->refresh()->price_min)->toBe(2000.0);
    expect((float) $updated->refresh()->price_max)->toBe(5000.0);
});

// ─── Publication + audit trail ───────────────────────────────────────────────

test('publish and unpublish write audit rows with actor and previous state', function () {
    $service = $this->service->createService([
        'name' => 'Audited Service',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);

    $this->service->publish($service);

    $publishedLog = AuditLog::query()
        ->where('entity', 'Service')
        ->where('action', 'published')
        ->firstOrFail();
    expect($publishedLog->entity_id)->toBe($service->id);
    expect($publishedLog->actor_id)->toBe($this->user->id);
    expect($publishedLog->metadata)->toBe(['previous' => false]);

    $this->service->unpublish($service);

    $unpublishedLog = AuditLog::query()
        ->where('entity', 'Service')
        ->where('action', 'unpublished')
        ->firstOrFail();
    expect($unpublishedLog->entity_id)->toBe($service->id);
    expect($unpublishedLog->actor_id)->toBe($this->user->id);
    expect($unpublishedLog->metadata)->toBe(['previous' => true]);
    expect($service->refresh()->is_published)->toBeFalse();
});

test('repeated publish is an idempotent no-op (single audit row)', function () {
    $service = $this->service->createService([
        'name' => 'Once Only',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);

    $this->service->publish($service);
    $this->service->publish($service);

    expect(AuditLog::query()->where('action', 'published')->count())->toBe(1);
    expect($service->refresh()->is_published)->toBeTrue();
});

test('delete writes the audit entry before removing the service', function () {
    $service = $this->service->createService([
        'name' => 'Doomed',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
    ]);

    $this->service->deleteService($service);

    $deletedLog = AuditLog::query()
        ->where('entity', 'Service')
        ->where('action', 'deleted')
        ->firstOrFail();
    expect((int) $deletedLog->entity_id)->toBe($service->id);

    expect(Service::query()->find($service->id))->toBeNull();
});
