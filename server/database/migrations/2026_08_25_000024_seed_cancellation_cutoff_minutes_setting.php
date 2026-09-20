<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the customer cancellation/reschedule cutoff window (PRD §9:
        // admin-editable). PRD §10: "Customer: up to 2 hrs pre-slot" — the
        // default is 120 minutes. Read via
        // BusinessSetting::getValue('cancellation_cutoff_minutes', 120) and
        // used by BookingService. The "Technician On The Way" hard block is a
        // SYSTEM rule and is NOT stored here (PRD §9: not admin-editable).
        // Stored as 'integer' so the typed read helper returns an int.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'cancellation_cutoff_minutes'],
            ['value' => '120', 'type' => 'integer', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'cancellation_cutoff_minutes')->delete();
    }
};
