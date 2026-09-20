<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            // Nullable: a category is valid without a visual (design.md §3.4 renders gracefully).
            $table->foreignId('logo_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            // Nullable: no banner = category page renders without a banner slot (design.md §3.6).
            $table->foreignId('banner_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            // Nullable: description is optional marketing copy.
            $table->text('description')->nullable();
            $table->unsignedInteger('display_order')->default(0)->index();
            $table->boolean('is_published')->default(false)->index();
            // Nullable: top-level categories have no parent (two-level hierarchy, PRD §7.2 / §12 #14).
            // nullOnDelete promotes orphaned children to top-level instead of cascading deletes.
            $table->foreignId('parent_category_id')->nullable()->index()->constrained('categories')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
