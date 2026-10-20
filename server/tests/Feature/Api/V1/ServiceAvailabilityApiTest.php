<?php

use App\Models\BusinessHour;
use App\Models\Holiday;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\SlotHold;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TASK BE3 - public availability endpoint for the booking wizard.
 *
 * GET /api/v1/services/{slug}/availability?date=YYYY-MM-DD
 *
 * This is a READ endpoint. It must never write (no hold is attempted) and must
 * agree with the booking write path about which windows are taken.
 */
uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
});

// ─── Helpers (mirroring the Scheduling module-test convention) ────────────────

function setAvailabilitySetting(string $key, string $value): void
{
    DB::table('business_settings')->where('key', $key)->update(['value' => $value]);
}

function openAvailabilityDay(Carbon $date, string $open, string $close): void
{
    BusinessHour::factory()->hours($open, $close)
        ->create(['day_of_week' => (int) $date->dayOfWeek]);
}

function publishedService(array $overrides = []): Service
{
    return Service::factory()->create([
        'slug' => 'laptop-repair',
        'is_published' => true,
        'duration_minutes' => 60,
        ...$overrides,
    ]);
}

/** A published service with an open 09:00-17:00 window on the target date. */
function serviceOpenOn(Carbon $date, array $overrides = []): Service
{
    openAvailabilityDay($date, '09:00:00', '17:00:00');
    setAvailabilitySetting('min_booking_notice_minutes', '0');
    setAvailabilitySetting('service_buffer_minutes', '0');

    return publishedService($overrides);
}

function slotStarts(array $response): array
{
    return array_map(
        fn (array $slot) => Carbon::parse($slot['start'])->format('H:i'),
        $response,
    );
}

afterEach(function () {
    Carbon::setTestNow();
});

// ─── Normal working day ──────────────────────────────────────────────────────

test('returns the slots for a normal working day', function () {
    Carbon::setTestNow('2026-09-19 08:00:00'); // Saturday
    $monday = Carbon::parse('2026-09-21');
    serviceOpenOn($monday);

    $response = $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21');

    $response->assertOk()
        ->assertJsonStructure([
            'service' => ['id', 'slug', 'duration_minutes'],
            'date',
            'timezone',
            'slots' => [['start', 'end']],
        ])
        ->assertJsonPath('service.slug', 'laptop-repair')
        ->assertJsonPath('service.duration_minutes', 60)
        ->assertJsonPath('date', '2026-09-21');

    // 60-min duration, no buffer, 09:00-17:00 -> 9 whole hours start on the hour.
    expect(slotStarts($response->json('slots')))
        ->toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
});

test('timestamps are ISO-8601 and carry the offset', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    $slot = $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')
        ->json('slots.0');

    // "Y-m-d\TH:i:sP" - the offset must be present, not a bare "Z" and not naive.
    expect($slot['start'])->toBe('2026-09-21T09:00:00+00:00')
        ->and($slot['end'])->toBe('2026-09-21T10:00:00+00:00');
});

test('reports the project timezone, which scheduling treats as the app timezone', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')
        ->assertOk()
        // SlotGenerationService does no timezone conversion of its own - it builds
        // every timestamp with Carbon::parse() in the app's default zone. The
        // response must therefore name that same zone, not a per-tenant one.
        ->assertJsonPath('timezone', config('app.timezone'));
});

// ─── Closed day / holiday ────────────────────────────────────────────────────

test('returns no slots on a closed weekday', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $sunday = Carbon::parse('2026-09-20');
    publishedService();
    BusinessHour::factory()->closed()->create(['day_of_week' => (int) $sunday->dayOfWeek]);

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-20')
        ->assertOk()
        ->assertJsonCount(0, 'slots');
});

test('returns no slots on a holiday even when the weekday is otherwise open', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    serviceOpenOn($monday);
    Holiday::factory()->create(['date' => $monday->format('Y-m-d')]);

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')
        ->assertOk()
        ->assertJsonCount(0, 'slots');
});

// ─── Occupied windows ────────────────────────────────────────────────────────

test('excludes a window that already has a booking', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    $service = serviceOpenOn($monday);

    ServiceBooking::factory()
        ->window('2026-09-21 10:00:00', '2026-09-21 11:00:00')
        ->create(['service_id' => $service->id, 'status' => 'confirmed']);

    $response = $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21');

    $response->assertOk();

    expect(slotStarts($response->json('slots')))
        ->not->toContain('10:00')
        // Only that one window is gone; the rest of the day is untouched.
        ->toContain('09:00')
        ->toContain('11:00');
});

test('a cancelled booking does not block its window', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    $service = serviceOpenOn($monday);

    ServiceBooking::factory()
        ->cancelled()
        ->window('2026-09-21 10:00:00', '2026-09-21 11:00:00')
        ->create(['service_id' => $service->id]);

    expect(slotStarts($this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')->json('slots')))
        ->toContain('10:00');
});

test('excludes a window that is currently held', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    serviceOpenOn($monday);

    SlotHold::factory()
        ->window('2026-09-21 14:00:00', '2026-09-21 15:00:00')
        ->create(['expires_at' => now()->addMinutes(10)]);

    expect(slotStarts($this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')->json('slots')))
        ->not->toContain('14:00')
        ->toContain('13:00')
        ->toContain('15:00');
});

test('an expired hold frees its window again', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    serviceOpenOn($monday);

    SlotHold::factory()
        ->window('2026-09-21 14:00:00', '2026-09-21 15:00:00')
        ->create(['expires_at' => now()->subMinute()]);

    expect(slotStarts($this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')->json('slots')))
        ->toContain('14:00');
});

test('never creates a hold while reading availability', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')->assertOk();

    // A read endpoint that took holds would lock every customer out of the slot
    // they are currently looking at.
    expect(SlotHold::query()->count())->toBe(0);
});

// ─── Validation ──────────────────────────────────────────────────────────────

test('rejects a missing date', function () {
    publishedService();

    $this->getJson('/api/v1/services/laptop-repair/availability')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');
});

test('rejects a malformed date with a field error', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    publishedService();

    $this->getJson('/api/v1/services/laptop-repair/availability?date=21-09-2026')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');
});

test('rejects a date in the past', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    publishedService();

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-18')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');
});

test('rejects a date beyond the configurable advance window', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    publishedService();

    // Default seeded window is 60 days -> 2026-11-18 is the last bookable date.
    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-11-19')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-11-18')
        ->assertOk();
});

test('the advance window follows the business setting rather than a code constant', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    publishedService();
    setAvailabilitySetting('booking_max_advance_days', '7');

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-27')
        ->assertStatus(422)
        ->assertJsonValidationErrors('date');

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-26')
        ->assertOk();
});

test('rejects an unknown mode', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21&mode=whenever')
        ->assertStatus(422)
        ->assertJsonValidationErrors('mode');
});

// ─── 404 / no leakage ────────────────────────────────────────────────────────

test('unknown and unpublished services return byte-identical 404s', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));
    Service::factory()->create(['slug' => 'draft-service', 'is_published' => false]);

    $unpublished = $this->getJson('/api/v1/services/draft-service/availability?date=2026-09-21');
    $missing = $this->getJson('/api/v1/services/never-existed/availability?date=2026-09-21');

    $unpublished->assertStatus(404);
    $missing->assertStatus(404);

    expect($unpublished->getContent())->toBe($missing->getContent())
        ->and($unpublished->getContent())->toBe('{"message":"Not Found"}');
});

// ─── Public access + throttle ────────────────────────────────────────────────

test('works with no authentication', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21')
        ->assertOk();
});

test('agrees with an authenticated caller', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    $guest = $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21');

    $authed = $this->actingAs(User::factory()->create())
        ->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21');

    expect($authed->json('slots'))->toEqual($guest->json('slots'));
});

test('the endpoint is throttle limited', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    serviceOpenOn(Carbon::parse('2026-09-21'));

    // Two independent proofs that the limiter is really wired to THIS route and
    // really executing, without hammering it until it trips:
    //  1. the resolved route carries the named throttle middleware;
    //  2. a normal response carries the limiter's own rate-limit headers, which
    //     only appear once a ThrottleRequests middleware has run.
    $route = app('router')->getRoutes()->getByName('services.availability');

    expect($route)->not->toBeNull();
    expect(collect($route->gatherMiddleware()))
        ->toContain('throttle:service-availability');

    $response = $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21');

    $response->assertOk();
    expect($response->headers->has('X-RateLimit-Limit'))->toBeTrue();
});

// ─── mode=nearest (phases.md Phase 7 "nearest-slot suggestion logic") ─────────

test('mode=nearest returns the first slot on or after the requested date', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    serviceOpenOn($monday);

    $response = $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21&mode=nearest');

    $response->assertOk()
        ->assertJsonStructure(['service', 'date', 'timezone', 'slots', 'nearest_slot' => ['start', 'end']])
        ->assertJsonPath('nearest_slot.start', '2026-09-21T09:00:00+00:00');
});

test('mode=nearest steps over a closed day to the next open day', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $sunday = Carbon::parse('2026-09-20');
    $monday = Carbon::parse('2026-09-21');

    publishedService();
    setAvailabilitySetting('min_booking_notice_minutes', '0');
    setAvailabilitySetting('service_buffer_minutes', '0');
    BusinessHour::factory()->closed()->create(['day_of_week' => (int) $sunday->dayOfWeek]);
    openAvailabilityDay($monday, '09:00:00', '17:00:00');

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-20&mode=nearest')
        ->assertOk()
        ->assertJsonPath('nearest_slot.start', '2026-09-21T09:00:00+00:00');
});

test('mode=nearest skips a window that is already booked', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    $service = serviceOpenOn($monday);

    // Book out the whole first three hours so the nearest free window is 12:00.
    ServiceBooking::factory()
        ->window('2026-09-21 09:00:00', '2026-09-21 12:00:00')
        ->create(['service_id' => $service->id, 'status' => 'confirmed']);

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21&mode=nearest')
        ->assertOk()
        ->assertJsonPath('nearest_slot.start', '2026-09-21T12:00:00+00:00');
});

test('mode=nearest returns null when the search range is exhausted', function () {
    Carbon::setTestNow('2026-09-19 08:00:00');
    $monday = Carbon::parse('2026-09-21');
    publishedService();
    setAvailabilitySetting('min_booking_notice_minutes', '0');
    BusinessHour::factory()->closed()->create(['day_of_week' => (int) $monday->dayOfWeek]);

    $this->getJson('/api/v1/services/laptop-repair/availability?date=2026-09-21&mode=nearest')
        ->assertOk()
        ->assertJsonPath('nearest_slot', null);
});
