<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('business_settings')->updateOrInsert(
            ['key' => 'serviceable_cities'],
            [
                'value' => json_encode(['Karachi']),
                'type' => 'json',
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        DB::table('business_settings')->where('key', 'serviceable_cities')->delete();
    }
};
