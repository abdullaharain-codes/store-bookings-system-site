<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the master email-notifications toggle (PRD §12): website
        // notifications are ALWAYS recorded (not user-toggleable); email
        // sending is gated by this single global setting, default ON. Stored
        // as type 'boolean' so the BusinessSetting::getValue typed-read helper
        // returns a bool to application code. The write path (Settings module)
        // canonicalizes booleans to '1'/'0' so the helper's (bool) cast stays
        // correct. Uses the existing settings-seeding mechanism (data
        // migration with updateOrInsert, matching the other seed_*_setting
        // migrations) rather than a schema migration, per architecture §4.1.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'email_notifications_enabled'],
            ['value' => '1', 'type' => 'boolean', 'created_at' => now(), 'updated_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'email_notifications_enabled')->delete();
    }
};
