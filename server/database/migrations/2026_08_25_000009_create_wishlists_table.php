<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wishlists', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: wishlist entries have no meaning without their
            // owner — a stale row pointing at a deleted user is dead weight.
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // cascadeOnDelete: a removed product cannot stay wishlisted — the
            // entry would point at nothing renderable.
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->timestamps();

            // One wishlist entry per user+product; toggling removes instead of
            // duplicating. Doubles as the per-user listing index (rules.md §6).
            $table->unique(['user_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wishlists');
    }
};
