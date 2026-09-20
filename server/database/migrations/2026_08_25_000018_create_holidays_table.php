<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('holidays', function (Blueprint $table) {
            $table->id();

            // One blocked calendar date per row (architecture.md §4
            // "Holiday/BlockedSlot"). Unique doubles as the lookup index for
            // slot generation, which checks this table on every date.
            $table->date('date')->unique();

            // Admin-facing label, e.g. "Eid Holiday" — cosmetic, never used in
            // slot math.
            $table->string('reason')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
    }
};
