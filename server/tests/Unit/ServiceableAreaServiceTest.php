<?php

use App\Models\BusinessSetting;
use App\Modules\Scheduling\Services\ServiceableAreaService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('cities returns the configured list', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode(['Karachi', 'Lahore']), 'type' => 'json'],
    );

    $service = app(ServiceableAreaService::class);

    expect($service->cities())->toBe(['Karachi', 'Lahore']);
});

test('isServiceable is case-insensitive and trims input', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode(['Karachi', 'Lahore']), 'type' => 'json'],
    );

    $service = app(ServiceableAreaService::class);

    expect($service->isServiceable('karachi'))->toBeTrue();
    expect($service->isServiceable(' LAHORE '))->toBeTrue();
    expect($service->isServiceable('Islamabad'))->toBeFalse();
});

test('empty list means no restriction', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode([]), 'type' => 'json'],
    );

    $service = app(ServiceableAreaService::class);

    expect($service->cities())->toBe([]);
    expect($service->isServiceable('Any City'))->toBeTrue();
});
