<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('sku')->unique();
            // Nullable: description is optional marketing copy.
            $table->text('description')->nullable();
            $table->decimal('price', 10, 2);
            $table->unsignedInteger('stock_quantity')->default(0);
            // Nullable: a product is valid without a brand (PRD §5.1 — brand is
            // an optional shop filter, not a required attribute).
            // nullOnDelete keeps the product when a brand is removed instead of
            // cascading deletes into catalog data.
            // Explicit index: SQLite does not auto-index FK columns the way MySQL
            // does, and brand_id is a frequently-filtered shop filter column
            // (rules.md §6) — same precedent as categories.parent_category_id.
            $table->foreignId('brand_id')->nullable()->index()->constrained('brands')->nullOnDelete();
            $table->boolean('is_published')->default(false)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
