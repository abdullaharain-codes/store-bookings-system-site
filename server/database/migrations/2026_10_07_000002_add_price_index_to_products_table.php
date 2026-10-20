<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * price became a frequently-filtered column with BE4 (min_price/max_price
     * range filters and the price_asc/price_desc sorts) — same rationale as
     * the explicit brand_id and is_published indexes in the create migration
     * (rules.md §6).
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->index('price');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['price']);
        });
    }
};
