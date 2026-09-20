<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_hours', function (Blueprint $table) {
            $table->id();

            // CRITICAL CONVENTION: day_of_week uses PHP's date('w') /
            // Carbon dayOfWeek numbering — 0 = Sunday, 1 = Monday, ...,
            // 6 = Saturday. Off-by-one here would corrupt every later slot
            // calculation (the Scheduling module depends on this mapping).
            $table->unsignedTinyInteger('day_of_week');

            // TIME columns. Both nullable: a day that is "closed" has null
            // times AND is_closed = true. is_closed is the single source of
            // truth for closure so "closed" is never ambiguous with a stray
            // half-set interval.
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();

            $table->boolean('is_closed')->default(false);

            $table->timestamps();

            // Exactly one row per weekday — admin edits operate upsert-style
            // (update the single row), never accumulate duplicate days.
            $table->unique('day_of_week');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('business_hours');
    }
};
