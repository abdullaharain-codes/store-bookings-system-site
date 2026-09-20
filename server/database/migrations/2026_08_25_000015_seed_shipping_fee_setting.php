<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the platform-wide flat shipping fee.  The value is read via
        // BusinessSetting::getValue('shipping_fee', 200) and used by
        // OrderService to compute the order total at checkout.
        // Stored as 'string' type because BusinessSetting's typed read helper
        // returns the raw string for unknown types — OrderService casts to
        // float.  This avoids modifying BusinessSetting's type system for a
        // single decimal setting.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'shipping_fee'],
            ['value' => '200', 'type' => 'string', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'shipping_fee')->delete();
    }
};
