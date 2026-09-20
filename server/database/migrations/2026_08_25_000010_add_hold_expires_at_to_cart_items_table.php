<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            // Nullable timestamp: when set, this cart_item holds a reservation on
            // the product's stock. A NULL value means no active hold — the item
            // exists in the cart UI but does not reserve inventory (e.g. after
            // the hold expired, or if holds are disabled).
            $table->timestamp('hold_expires_at')->nullable()->after('quantity');
            // Indexed because every stock-availability check filters on this
            // column (rules.md §6) — without the index each availability query
            // would full-scan the cart_items table under concurrent load.
            $table->index('hold_expires_at', 'cart_items_hold_expires_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            $table->dropIndex('cart_items_hold_expires_at_index');
            $table->dropColumn('hold_expires_at');
        });
    }
};
