<?php

use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('services table exists with the expected columns', function () {
    expect(Schema::hasTable('services'))->toBeTrue();

    foreach ([
        'id',
        'name',
        'slug',
        'description',
        'price_min',
        'price_max',
        'duration_minutes',
        'is_published',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('services', $column))->toBeTrue();
    }
});

test('factory creates a valid service row', function () {
    $service = Service::factory()->create();

    $this->assertDatabaseHas('services', ['id' => $service->id]);

    expect($service->name)->not->toBeEmpty();
    expect($service->slug)->not->toBeEmpty();
    // price_min < price_max is guaranteed by the factory definition.
    expect((float) $service->price_min)->toBeLessThan((float) $service->price_max);
    expect($service->duration_minutes)->toBeBetween(30, 240);
    expect($service->is_published)->toBeBool();
});
