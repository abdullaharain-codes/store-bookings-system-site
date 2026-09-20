<?php

use App\Models\BusinessHour;
use App\Models\Holiday;
use App\Modules\Scheduling\Services\SlotGenerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

// ─── Helpers (global functions, mirroring the module-test convention) ────────

function slotService(): SlotGenerationService
{
    return app(SlotGenerationService::class);
}

function setSetting(string $key, string $value): void
{
    DB::table('business_settings')->where('key', $key)->update(['value' => $value]);
}

function openDay(Carbon $date, string $open, string $close): void
{
    BusinessHour::factory()->hours($open, $close)
        ->create(['day_of_week' => (int) $date->dayOfWeek]);
}

function closeDay(Carbon $date): void
{
    BusinessHour::factory()->closed()
        ->create(['day_of_week' => (int) $date->dayOfWeek]);
}

afterEach(function () {
    Carbon::setTestNow();
});

// ─── Closed / no row / holiday ───────────────────────────────────────────────

test('returns no slots when that weekday is marked closed', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    setSetting('min_booking_notice_minutes', '0');
    closeDay(Carbon::parse('2026-09-20'));

    expect(slotService()->generateSlots(Carbon::parse('2026-09-20'), 60))
        ->toBeEmpty();
});

test('returns no slots when no business hour row exists for that weekday', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');

    expect(slotService()->generateSlots(Carbon::parse('2026-09-21'), 60))
        ->toBeEmpty();
});

test('returns no slots on a holiday even when that weekday is otherwise open', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    setSetting('min_booking_notice_minutes', '0');
    $sunday = Carbon::parse('2026-09-20');
    openDay($sunday, '09:00:00', '18:00:00');
    Holiday::factory()->create(['date' => $sunday->format('Y-m-d')]);

    expect(slotService()->generateSlots($sunday, 60))->toBeEmpty();

    // Control: a holiday-free open Sunday in the same week still yields slots.
    expect(slotService()->generateSlots($sunday->copy()->addWeek(), 60))
        ->not->toBeEmpty();
});

// ─── Spacing, buffer, no-spill-past-closing ──────────────────────────────────

test('steps slots by duration plus buffer and never spills past closing', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    setSetting('min_booking_notice_minutes', '0');
    setSetting('service_buffer_minutes', '15');
    $sunday = Carbon::parse('2026-09-20');
    openDay($sunday, '09:00:00', '17:45:00');

    $slots = slotService()->generateSlots($sunday, 60);

    expect(array_map(fn ($s) => $s['start']->format('H:i'), $slots))
        ->toEqual(['09:00', '10:15', '11:30', '12:45', '14:00', '15:15', '16:30']);

    foreach ($slots as $slot) {
        // The bookable window is duration only (:00 past the top of the hour).
        expect($slot['end']->diffInMinutes($slot['start'], true))->toBe(60.0);
        // The service itself must fit before closing — buffer is spacing only.
        expect($slot['end']->lessThanOrEqualTo(Carbon::parse('2026-09-20 17:45:00')))
            ->toBeTrue();
    }

    for ($i = 1; $i < count($slots); $i++) {
        expect($slots[$i]['start']->diffInMinutes($slots[$i - 1]['start'], true))->toBe(75.0);
    }
});

test('drops a candidate whose service window would spill past closing', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    setSetting('min_booking_notice_minutes', '0');
    setSetting('service_buffer_minutes', '20');
    $sunday = Carbon::parse('2026-09-20');
    openDay($sunday, '09:00:00', '17:30:00');

    $slots = slotService()->generateSlots($sunday, 90);

    // Duration 90 + buffer 20 → 110-min step. 16:20 would need to end at 17:50
    // (past 17:30) so it must be dropped; 14:30 is the true last candidate.
    expect(array_map(fn ($s) => $s['start']->format('H:i'), $slots))
        ->toEqual(['09:00', '10:50', '12:40', '14:30']);

    foreach ($slots as $slot) {
        expect($slot['end']->lessThanOrEqualTo(Carbon::parse('2026-09-20 17:30:00')))
            ->toBeTrue();
    }
});

// ─── Minimum booking notice (frozen clock) ───────────────────────────────────

test('excludes near-term slots that violate the minimum booking notice', function () {
    Carbon::setTestNow('2026-09-19 09:30:00');
    setSetting('min_booking_notice_minutes', '60');
    setSetting('service_buffer_minutes', '0');
    openDay(Carbon::parse('2026-09-19'), '09:00:00', '18:00:00');

    $slots = slotService()->generateSlots(Carbon::parse('2026-09-19'), 45);

    $starts = array_map(fn ($s) => $s['start']->format('H:i'), $slots);

    // First allowed start is exactly now + 60min (10:30); everything before is gone.
    expect($starts[0])->toBe('10:30');
    expect($starts)->not->toContain('09:00');
    expect($starts)->not->toContain('09:45');
    expect($starts)->not->toContain('10:15');
    expect($starts)->toHaveCount(10);
});

// ─── nearestAvailableSlot ────────────────────────────────────────────────────

test('nearestAvailableSlot skips a fully closed day and finds the next open day', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    setSetting('min_booking_notice_minutes', '0');
    setSetting('service_buffer_minutes', '0');
    closeDay(Carbon::parse('2026-09-20'));       // Sunday — closed
    openDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00'); // Monday — open

    $slot = slotService()->nearestAvailableSlot(
        Carbon::parse('2026-09-20 12:00:00'),
        60,
    );

    expect($slot)->not->toBeNull();
    expect($slot['start']->format('Y-m-d H:i:s'))->toBe('2026-09-21 09:00:00');
    expect($slot['end']->format('Y-m-d H:i:s'))->toBe('2026-09-21 10:00:00');
});

test('nearestAvailableSlot returns null when every day in the range is closed', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $preferred = Carbon::parse('2026-09-19 12:00:00');

    closeDay($preferred);
    closeDay($preferred->copy()->addDays(1));
    closeDay($preferred->copy()->addDays(2));

    expect(slotService()->nearestAvailableSlot($preferred, 45, 3))->toBeNull();
});
