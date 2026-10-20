<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the configurable booking horizon: the public availability endpoint
        // refuses a date further out than now + this many days, so a caller
        // cannot ask the scheduling engine to generate an arbitrary future range.
        //
        // Deliberately NOT a code constant (rules.md §6 — business rules belong in
        // BusinessSetting, like min_booking_notice_minutes and
        // service_buffer_minutes). Read via
        // BusinessSetting::getValue('booking_max_advance_days', 60) in
        // ServiceAvailabilityRequest. Stored as 'integer' so the typed read
        // helper returns an int rather than a string.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'booking_max_advance_days'],
            ['value' => '60', 'type' => 'integer', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'booking_max_advance_days')->delete();
    }
};
