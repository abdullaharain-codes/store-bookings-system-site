<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the configurable minimum-advance booking window: no slot that
        // starts earlier than now + this many minutes is ever offered for
        // booking. The value is read via
        // BusinessSetting::getValue('min_booking_notice_minutes', 60) and used
        // by SlotGenerationService to drop near-term candidate slots.
        // Stored as 'integer' type so the typed read helper returns an int.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'min_booking_notice_minutes'],
            ['value' => '60', 'type' => 'integer', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'min_booking_notice_minutes')->delete();
    }
};
