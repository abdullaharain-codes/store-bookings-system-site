<?php

namespace App\Modules\Scheduling\Support;

use App\Models\BusinessSetting;
use DateTimeZone;
use Illuminate\Support\Carbon;

/**
 * The single place that knows which timezone the SCHEDULE is expressed in.
 *
 * The split this class exists to enforce (TZ1):
 *
 *   - INSTANTS are UTC. `scheduled_slot_start`, `slot_holds.starts_at/ends_at` and
 *     every comparison/overlap query stay in the app zone, so the database and the
 *     concurrency guarantees are untouched.
 *   - CALENDAR INTERPRETATION is business-local. A `business_hours` row's
 *     '09:00' is a wall-clock time in the business zone, and a `holidays.date` is
 *     a business-local calendar date. "Today", the day-of-week lookup and the
 *     booking horizon are all business-local too.
 *
 * Getting this wrong is not cosmetic: reading 09:00 as UTC books a Karachi shop
 * five hours after it opens.
 *
 * Resolved once per request (TZ1-fix): the settings row was being read up to 23
 * times for a single availability request. The memo is process-static so every
 * BusinessClock resolved in a request - request validity, controller, slot
 * generator - sees the same value, and it is cleared whenever a BusinessSetting
 * is saved (BusinessSetting::booted) and at the start of every test
 * (tests/TestCase::setUp), so a changed zone is re-read on the next request
 * rather than served stale.
 */
class BusinessClock
{
    public const SETTING_KEY = 'business_timezone';

    /**
     * Used only when the setting row is missing entirely (e.g. a fresh install
     * whose seed migration has not run). Matches the seeded value.
     */
    public const FALLBACK_TIMEZONE = 'Asia/Karachi';

    private static ?string $resolvedTimezone = null;

    /**
     * The configured business timezone, guaranteed to be a real IANA identifier.
     *
     * Falls back rather than throwing: an unreadable setting must not take down
     * every booking read, and a bad value can only have arrived by bypassing the
     * settings API, which validates the zone on write.
     */
    public function timezone(): string
    {
        return self::$resolvedTimezone ??= $this->resolveTimezone();
    }

    /**
     * Forget the memoised zone. Called whenever a BusinessSetting is saved (so
     * an admin change is honoured on the next request) and at the start of every
     * test (so a value memoised by one test can never leak into the next).
     */
    public static function clearMemo(): void
    {
        self::$resolvedTimezone = null;
    }

    private function resolveTimezone(): string
    {
        $configured = BusinessSetting::getValue(self::SETTING_KEY);

        if (is_string($configured) && $configured !== '' && $this->isValid($configured)) {
            return $configured;
        }

        return $this->isValid(self::FALLBACK_TIMEZONE)
            ? self::FALLBACK_TIMEZONE
            : config('app.timezone');
    }

    public function isValid(string $timezone): bool
    {
        return in_array($timezone, DateTimeZone::listIdentifiers(), true);
    }

    /**
     * Today's calendar date IN THE BUSINESS ZONE, at business-local midnight.
     *
     * This is the "today" the booking horizon and the not-in-the-past validation
     * compare against. At 22:00 UTC on the 20th it is already the 21st in Karachi,
     * and treating the UTC date as "today" would offer a day that has begun.
     */
    public function today(): Carbon
    {
        return Carbon::now($this->timezone())->startOfDay();
    }

    /**
     * Normalise any date-ish value to the business-local calendar DAY.
     *
     * Accepts a `Y-m-d` string or a Carbon in any zone and returns business-local
     * midnight for that same Y-m-d. The Y-m-d is read off the *input*, so a date
     * already expressed in the business zone is never shifted by a zone
     * conversion (converting 2026-09-21 00:00 UTC to Karachi would roll forward
     * to the 22nd).
     */
    public function localDate(Carbon|string $date): Carbon
    {
        $day = $date instanceof Carbon
            ? $date->format('Y-m-d')
            : Carbon::parse($date)->format('Y-m-d');

        return Carbon::createFromFormat('Y-m-d H:i:s', $day.' 00:00:00', $this->timezone());
    }

    /**
     * A business-local wall-clock time on $date as an absolute INSTANT.
     *
     * This is the conversion that was missing: `09:00` on 2026-09-21 in
     * Asia/Karachi is 2026-09-21T04:00:00Z. Returned in the app zone (UTC) so
     * everything downstream compares and stores UTC as before.
     *
     * @param  string  $time  'H:i:s' as stored on a business_hours row
     */
    public function instant(Carbon $date, string $time): Carbon
    {
        $local = Carbon::createFromFormat(
            'Y-m-d H:i:s',
            $date->format('Y-m-d').' '.$time,
            $this->timezone(),
        );

        return $local->copy()->setTimezone(config('app.timezone'));
    }

    /**
     * An instant expressed in the business zone, for rendering to a human.
     * Presentation only - never feed the result back into a comparison.
     */
    public function toBusiness(Carbon $instant): Carbon
    {
        return $instant->copy()->setTimezone($this->timezone());
    }
}
