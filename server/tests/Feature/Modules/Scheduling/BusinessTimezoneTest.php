<?php

use App\Models\BusinessHour;
use App\Models\BusinessSetting;
use App\Models\Holiday;
use App\Models\Role;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TASK TZ1 - the schedule is interpreted in a configurable BUSINESS timezone
 * (default Asia/Karachi) while app.timezone and every stored instant stay UTC.
 *
 * The suite-wide default pins business_timezone to UTC (tests/Pest.php), because
 * the pre-existing Scheduling assertions were written when "09:00" meant 09:00
 * UTC. These tests opt back IN to a real business zone and assert the offsets
 * that zone produces.
 */
uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    // Karachi: UTC+5, no DST.
    BusinessSetting::where('key', 'business_timezone')->update(['value' => 'Asia/Karachi']);

    // Zero the two duration settings so slot steps are the service duration and
    // the whole file is about offsets rather than arithmetic. The one test that
    // exercises buffer/notice sets them itself.
    BusinessSetting::where('key', 'service_buffer_minutes')->update(['value' => '0']);
    BusinessSetting::where('key', 'min_booking_notice_minutes')->update(['value' => '0']);
});

afterEach(function () {
    Carbon::setTestNow();
});

// ─── helpers (uniquely named: Pest shares one function namespace) ────────────

function tzOpenKarachiDay(Carbon $businessDate, string $open, string $close): void
{
    BusinessHour::factory()->hours($open, $close)
        ->create(['day_of_week' => (int) $businessDate->dayOfWeek]);
}

function tzService(array $overrides = []): Service
{
    return Service::factory()->create([
        'slug' => 'ac-repair',
        'is_published' => true,
        'duration_minutes' => 60,
        ...$overrides,
    ]);
}

function tzStarts(array $response): array
{
    return array_map(
        fn (array $slot) => Carbon::parse($slot['start'])->format('H:i'),
        $response,
    );
}

// ─── Generation: local wall-clock hours become correctly offset instants ─────

test('a 09:00-17:00 business day yields 09:00..16:00 +05:00, i.e. 04:00..11:00 UTC', function () {
    Carbon::setTestNow('2026-09-19 08:00:00'); // Saturday
    $monday = Carbon::parse('2026-09-21'); // Monday, business-local
    tzOpenKarachiDay($monday, '09:00:00', '17:00:00');
    tzService();

    $response = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk();

    // The wall-clock time a Karachi customer reads is unchanged: 09:00..16:00.
    expect(tzStarts($response->json('slots')))
        ->toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);

    // ...but each instant is expressed in the business zone, not the app zone.
    expect($response->json('slots.0.start'))->toBe('2026-09-21T09:00:00+05:00')
        ->and($response->json('slots.0.end'))->toBe('2026-09-21T10:00:00+05:00');
});

test('the same instants are 04:00..11:00 UTC in the database zone', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    tzOpenKarachiDay($monday, '09:00:00', '17:00:00');
    tzService();

    $slot = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->json('slots.0');

    // 09:00 +05:00 is 04:00 UTC: the engine's own instants stay in the app zone,
    // which is what gets stored. Only presentation moves.
    $asUtc = Carbon::parse($slot['start'])->setTimezone('UTC');

    expect($asUtc->format('Y-m-d H:i'))->toBe('2026-09-21 04:00');
});

test('the response names the business timezone, not the app timezone', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00');
    tzService();

    $response = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21');

    $response->assertOk()
        ->assertJsonPath('timezone', 'Asia/Karachi');

    // The app zone is unchanged - this is a presentation/interpretation split,
    // not a global timezone switch.
    expect(config('app.timezone'))->toBe('UTC');
});

test('a service buffer and minimum notice are still plain durations', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    tzOpenKarachiDay($monday, '09:00:00', '17:00:00');
    tzService(['duration_minutes' => 60]);

    BusinessSetting::where('key', 'service_buffer_minutes')->update(['value' => '30']);
    BusinessSetting::where('key', 'min_booking_notice_minutes')->update(['value' => '0']);

    // 60-min service + 30-min buffer steps the start by 90 minutes.
    expect(tzStarts($this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')->json('slots')))
        ->toEqual(['09:00', '10:30', '12:00', '13:30', '15:00']);

    // Minimum notice is an offset from "now", so it is a pure instant comparison
    // and needs no timezone of its own. It can only bite on a date close enough to
    // now for the offset to matter, so ask for TODAY - 2026-09-19, a Saturday,
    // which is 08:00 UTC = 13:00 in Karachi.
    $today = Carbon::parse('2026-09-19');
    tzOpenKarachiDay($today, '09:00:00', '17:00:00');

    BusinessSetting::where('key', 'service_buffer_minutes')->update(['value' => '0']);
    BusinessSetting::where('key', 'min_booking_notice_minutes')->update(['value' => '0']);

    // Notice 0 still cannot book the past: it is 13:00 in Karachi right now, so
    // 09:00-12:00 local have already elapsed and only 13:00 onward remain.
    expect(tzStarts($this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-19')->json('slots')))
        ->toEqual(['13:00', '14:00', '15:00', '16:00']);

    // +120 minutes from 08:00 UTC is 10:00 UTC, which is 15:00 in Karachi, so the
    // first bookable wall-clock time moves 13:00 -> 15:00 local.
    BusinessSetting::where('key', 'min_booking_notice_minutes')->update(['value' => '120']);

    expect(tzStarts($this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-19')->json('slots')))
        ->toEqual(['15:00', '16:00']);
});

// ─── Day-of-week and holidays are business-local ────────────────────────────

test('the day of week is looked up in the business zone, not UTC', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    tzService();

    // 2026-09-20 is a Sunday in BOTH zones here, so instead prove the lookup
    // uses the business-local date: make Monday open and ask for Monday.
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '12:00:00');

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        // 09:00, 10:00 and 11:00 fit entirely inside 09:00-12:00.
        ->assertJsonCount(3, 'slots');

    // Sunday has no BusinessHour row at all.
    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-20')
        ->assertOk()
        ->assertJsonCount(0, 'slots');
});

test('a holiday on the business-local date blocks a day whose UTC date differs', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');

    // Deliberately an after-midnight business day: 00:30-06:00 Karachi is
    // 19:30-01:00 UTC on the PREVIOUS UTC date, so the UTC calendar day of the
    // generated instant (2026-09-20) differs from the business day (2026-09-21).
    tzOpenKarachiDay($monday, '00:30:00', '06:00:00');
    tzService();

    $open = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21');

    $open->assertOk();
    expect($open->json('slots.0.start'))->toBe('2026-09-21T00:30:00+05:00');

    $utcDay = Carbon::parse($open->json('slots.0.start'))->setTimezone('UTC')->toDateString();
    expect($utcDay)->toBe('2026-09-20'); // UTC calendar day really is different

    // A holiday keyed to the BUSINESS date must block it...
    Holiday::factory()->create(['date' => '2026-09-21']);

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        ->assertJsonCount(0, 'slots');

    // ...and a holiday on the UTC date must NOT block the business day.
    Holiday::query()->delete();
    Holiday::factory()->create(['date' => '2026-09-20']);

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        ->assertJsonCount(5, 'slots');
});

// ─── "today" is the business-local day, which can differ from the UTC day ────

test('"today" near UTC midnight resolves to the Karachi calendar day', function () {
    // 22:00 UTC on the 20th is already 03:00 on the 21st in Karachi.
    Carbon::setTestNow('2026-09-20 22:00:00');
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00');
    tzService();

    // The UTC-local "today" would be the 20th; the business-local today is the
    // 21st, so the 20th is in the PAST and must be refused.
    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-20')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk();
});

test('the advance window is counted in business-local calendar days', function () {
    Carbon::setTestNow('2026-09-20 22:00:00'); // business-local today = 2026-09-21
    tzService();

    // Default window is 60 days from the business-local today (2026-09-21), so
    // 2026-11-20 is the last bookable day and 2026-11-21 is out.
    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-11-21')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-11-20')
        ->assertOk();
});

// ─── Round trip through the booking write path ───────────────────────────────

test('a returned slot instant books cleanly and is stored as the same instant', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00');
    $service = tzService();

    $slot = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        ->json('slots.0');

    $response = $this->actingAs(User::factory()->create())
        ->postJson('/api/v1/bookings', [
            'service_id' => $service->id,
            // Exactly the string the availability endpoint handed back, offset
            // and all. It must be stored as 04:00 UTC, not 09:00 UTC.
            'scheduled_slot_start' => $slot['start'],
            'scheduled_slot_end' => $slot['end'],
        ]);

    $response->assertCreated();

    $stored = Carbon::parse($response->json('booking.scheduled_slot_start'))->setTimezone('UTC');

    expect($stored->format('Y-m-d H:i'))->toBe('2026-09-21 04:00');
});

test('booking the same returned slot twice is refused as an overlap', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00');
    $service = tzService();

    $slot = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->json('slots.0');

    $payload = [
        'service_id' => $service->id,
        'scheduled_slot_start' => $slot['start'],
        'scheduled_slot_end' => $slot['end'],
    ];

    $this->actingAs(User::factory()->create())->postJson('/api/v1/bookings', $payload)->assertCreated();
    $this->actingAs(User::factory()->create())->postJson('/api/v1/bookings', $payload)->assertStatus(422);

    // And the availability endpoint no longer offers the booked instant.
    expect(tzStarts($this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')->json('slots')))
        ->not->toContain('09:00')
        ->toContain('10:00');
});

test('a slot booked in business-local terms still frees exactly one window', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    tzOpenKarachiDay($monday, '00:30:00', '06:00:00'); // 19:30 UTC the day before
    $service = tzService();

    $slot = $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->json('slots.0');

    $this->actingAs(User::factory()->create())->postJson('/api/v1/bookings', [
        'service_id' => $service->id,
        'scheduled_slot_start' => $slot['start'],
        'scheduled_slot_end' => $slot['end'],
    ])->assertCreated();

    // Only 00:30 Karachi is gone; the rest of that business day survives, and
    // the 20th (UTC date) is still a closed day.
    expect(tzStarts($this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')->json('slots')))
        ->not->toContain('00:30')
        ->toContain('01:30');

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-20')
        ->assertOk()
        ->assertJsonCount(0, 'slots');
});

// ─── Settings API validates the zone name ───────────────────────────────────

test('the settings API rejects a non-IANA business timezone', function () {
    $admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);

    $this->actingAs($admin)
        ->patchJson('/api/v1/admin/settings/business_timezone', ['value' => 'Mars/Olympus_Mons'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    $this->actingAs($admin)
        ->patchJson('/api/v1/admin/settings/business_timezone', ['value' => 'Europe/London'])
        ->assertOk();
});

test('the seeded default is Asia/Karachi', function () {
    expect(BusinessSetting::getValue('business_timezone'))->toBe('Asia/Karachi');
});

// ---------------- business_timezone is read once per request (TZ1-fix) ----------------

test('business_timezone is read from the database at most once per request', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00');
    tzService();

    $reads = 0;
    DB::listen(function ($query) use (&$reads) {
        if (str_contains($query->sql, 'business_settings')
            && ($query->bindings[0] ?? null) === 'business_timezone') {
            $reads++;
        }
    });

    // Eight slots exercise the zone heavily: request validation ("today"), the
    // generator's local date/is instants, and one render per slot. All of it
    // must collapse into a single settings read.
    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        ->assertJsonCount(8, 'slots');

    expect($reads)->toBe(1);
});

test('a business timezone changed between requests is honoured on the next request', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    tzOpenKarachiDay(Carbon::parse('2026-09-21'), '09:00:00', '17:00:00');
    tzService();

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        ->assertJsonPath('timezone', 'Asia/Karachi')
        ->assertJsonPath('slots.0.start', '2026-09-21T09:00:00+05:00');

    // An Eloquent instance save fires the model's `saved` event, which clears
    // the memo - so the next request re-reads and reflects the new zone.
    BusinessSetting::where('key', 'business_timezone')->firstOrFail()
        ->update(['value' => 'Europe/London']); // September = BST, +01:00

    $this->getJson('/api/v1/services/ac-repair/availability?date=2026-09-21')
        ->assertOk()
        ->assertJsonPath('timezone', 'Europe/London')
        ->assertJsonPath('slots.0.start', '2026-09-21T09:00:00+01:00');
});
