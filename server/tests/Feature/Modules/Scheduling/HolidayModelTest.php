<?php

use App\Models\Holiday;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

uses(RefreshDatabase::class);

test('holidays table exists with the expected columns', function () {
    expect(Schema::hasTable('holidays'))->toBeTrue();

    foreach ([
        'id',
        'date',
        'reason',
        'created_at',
        'updated_at',
    ] as $column) {
        expect(Schema::hasColumn('holidays', $column))->toBeTrue();
    }
});

test('date carries the unique index', function () {
    // The unique constraint doubles as the lookup index slot generation hits
    // for every candidate date — confirm it exists at the schema level.
    $index = collect(DB::select("PRAGMA index_list('holidays')"))
        ->firstWhere('unique', 1);

    expect($index)->not->toBeNull();
});

test('factory creates a valid holiday row', function () {
    $holiday = Holiday::factory()->create();

    $this->assertDatabaseHas('holidays', ['id' => $holiday->id]);

    expect($holiday->date)->toBeInstanceOf(Carbon::class);
    expect($holiday->date->isFuture())->toBeTrue();
    expect($holiday->reason)->not->toBeEmpty();
});

test('creating a second row with the same date fails (unique constraint)', function () {
    $date = '2026-12-25';
    Holiday::factory()->create(['date' => $date]);

    expect(fn () => Holiday::factory()->create(['date' => $date]))
        ->toThrow(QueryException::class);
});
