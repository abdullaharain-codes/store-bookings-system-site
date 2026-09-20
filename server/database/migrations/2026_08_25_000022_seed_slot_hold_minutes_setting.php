<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the configurable duration of a temporary hold placed on a time
        // slot while a customer is mid-booking — the same concept as
        // cart_hold_minutes, but for time windows. The value is read via
        // BusinessSetting::getValue('slot_hold_minutes', 10) and used by
        // SlotHoldService to set expires_at on every attempted hold.
        // Stored as 'integer' type so the typed read helper returns an int.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'slot_hold_minutes'],
            ['value' => '10', 'type' => 'integer', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'slot_hold_minutes')->delete();
    }
};
