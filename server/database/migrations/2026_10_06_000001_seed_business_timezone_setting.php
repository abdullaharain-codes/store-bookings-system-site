<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // The zone the SCHEDULE is interpreted in, as distinct from
        // config('app.timezone') (which stays UTC for storage, sessions and logs).
        //
        // "09:00-17:00" in a business_hours row is a wall-clock time in THIS zone.
        // A slot generated from it is an instant, stored in UTC, and rendered back
        // to a customer in this zone - so a Karachi shop opens at 04:00 UTC.
        //
        // Seeded, not hard-coded (rules.md 6), and validated as an IANA identifier
        // on write by UpdateBusinessSettingRequest's `timezone` rule. Read through
        // BusinessClock, the single accessor every scheduling interpretation uses.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'business_timezone'],
            ['value' => 'Asia/Karachi', 'type' => 'string', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'business_timezone')->delete();
    }
};
