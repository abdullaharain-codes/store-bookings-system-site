<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('homepage_banners', function (Blueprint $table) {
            $table->id();

            // The banner image. REQUIRED — a hero banner without an image is
            // meaningless (design.md §3.7 carousel). RESTRICT (not the nullable
            // nullOnDelete pattern categories use for their optional visuals):
            // an asset in use by a live banner must not evaporate under it.
            $table->foreignId('asset_id')->constrained('assets')->restrictOnDelete();

            // THE point of the feature (PRD §8, architecture.md §4): a real FK
            // to Category, never a hard-coded URL. RESTRICT per
            // architecture.md §4's recommendation ("a category in use by a
            // live banner cannot be silently deleted") — the admin faces an
            // explicit integrity error instead.
            $table->foreignId('target_category_id')->constrained('categories')->restrictOnDelete();

            // Admin-defined carousel order (PRD §8 "reorder").
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->boolean('is_published')->default(false)->index();

            // Nullable scheduling window per architecture.md §4 ("startAt/endAt
            // nullable for future scheduling") — null = always active. The
            // scheduling logic itself is out of scope (the doc's own scope
            // note); only the columns exist so a later step needs no migration.
            $table->datetime('start_at')->nullable();
            $table->datetime('end_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('homepage_banners');
    }
};
