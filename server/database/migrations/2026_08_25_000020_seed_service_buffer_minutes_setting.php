<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the configurable inter-slot spacing for bookings: candidate
        // slots are stepped by service duration + this many minutes of buffer.
        // The buffer is spacing only — it is never part of a slot's own
        // bookable window. The value is read via
        // BusinessSetting::getValue('service_buffer_minutes', 15) and used by
        // SlotGenerationService.
        // Stored as 'integer' type so the typed read helper returns an int.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'service_buffer_minutes'],
            ['value' => '15', 'type' => 'integer', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'service_buffer_minutes')->delete();
    }
};
