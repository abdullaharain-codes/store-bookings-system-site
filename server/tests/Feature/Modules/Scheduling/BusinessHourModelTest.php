<?php

use App\Models\BusinessHour;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('business_hours table exists with the expected columns', function () {
    expect(Schema::hasTable('business_hours'))->toBeTrue();

    foreach ([
        'id',
        'day_of_week',
        'opens_at',
        'closes_at',
        'is_closed',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('business_hours', $column))->toBeTrue();
    }
});

test('day_of_week carries the unique index', function () {
    // The row-per-weekday invariant is what keeps admin editing upsert-style;
    // confirm the constraint actually exists at the schema level.
    $index = collect(DB::select("PRAGMA index_list('business_hours')"))
        ->firstWhere('unique', 1);

    expect($index)->not->toBeNull();
});

test('factory creates a valid business hour row', function () {
    $businessHour = BusinessHour::factory()->create();

    $this->assertDatabaseHas('business_hours', ['id' => $businessHour->id]);

    expect($businessHour->day_of_week)->toBeBetween(1, 5);
    expect($businessHour->is_closed)->toBeFalse();
    expect($businessHour->opens_at)->toBe('09:00:00');
    expect($businessHour->closes_at)->toBe('18:00:00');
});

test('closed() state marks the day explicitly closed with null times', function () {
    $closed = BusinessHour::factory()->closed()->create(['day_of_week' => 0]);

    expect($closed->is_closed)->toBeTrue();
    expect($closed->opens_at)->toBeNull();
    expect($closed->closes_at)->toBeNull();
});

test('hours() state customizes the open interval', function () {
    $custom = BusinessHour::factory()->hours('10:00:00', '20:00:00')->create(['day_of_week' => 3]);

    expect($custom->opens_at)->toBe('10:00:00');
    expect($custom->closes_at)->toBe('20:00:00');
    expect($custom->is_closed)->toBeFalse();
});

test('creating a second row for the same day_of_week fails (unique constraint)', function () {
    BusinessHour::factory()->create(['day_of_week' => 2]);

    expect(fn () => BusinessHour::factory()->create(['day_of_week' => 2]))
        ->toThrow(QueryException::class);
});
