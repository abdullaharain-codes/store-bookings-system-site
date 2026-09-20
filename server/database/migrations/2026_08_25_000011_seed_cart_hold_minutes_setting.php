<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed the configurable hold duration for cart stock reservations.
        // The value is read via BusinessSetting::getValue('cart_hold_minutes')
        // and used by CartService to compute hold_expires_at on every add.
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'cart_hold_minutes'],
            ['value' => '15', 'type' => 'integer', 'updated_at' => now(), 'created_at' => now()],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'cart_hold_minutes')->delete();
    }
};
