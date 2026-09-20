<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cart_items', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: an item row is meaningless without its cart.
            $table->foreignId('cart_id')->constrained('carts')->cascadeOnDelete();
            // cascadeOnDelete: a removed product cannot remain purchasable from
            // a stale cart row — dropping it beats surfacing a dead SKU at
            // checkout.
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            // Unsigned: quantity can never be negative; default 1 = single add.
            // The same product added twice increments this instead of creating
            // duplicate rows (enforced by the unique index below).
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();

            // A product appears at most once per cart; quantity carries
            // multiplicity. Also serves as the primary lookup index for
            // "what's in this cart?" loads (rules.md §6).
            $table->unique(['cart_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cart_items');
    }
};
