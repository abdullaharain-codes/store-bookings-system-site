<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: an image has no meaning without its product —
            // orphaned gallery rows would only ever be dead weight.
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            // cascadeOnDelete: the asset row is the image's single source of
            // truth; once the file record is gone the reference is meaningless.
            $table->foreignId('asset_id')->constrained('assets')->cascadeOnDelete();
            // Drives gallery ordering on the product detail page (design.md §3.8).
            $table->unsignedInteger('display_order')->default(0);
            $table->timestamps();

            // Gallery pages load by product in display order.
            $table->index(['product_id', 'display_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_images');
    }
};
