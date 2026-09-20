<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('review_showcase_items', function (Blueprint $table) {
            $table->id();

            // The showcase image. REQUIRED — a showcase carousel entry without
            // an image is meaningless. RESTRICT (not the nullable nullOnDelete
            // pattern categories use for their optional visuals): an asset in
            // use by a live showcase item must not evaporate under it (mirrors
            // homepage_banners asset_id exactly).
            $table->foreignId('asset_id')->constrained('assets')->restrictOnDelete();

            // Optional short display caption (task spec: string, nullable).
            $table->string('caption')->nullable();

            // Admin-defined carousel order (display_order indexes the feed).
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->boolean('is_published')->default(false)->index();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('review_showcase_items');
    }
};
