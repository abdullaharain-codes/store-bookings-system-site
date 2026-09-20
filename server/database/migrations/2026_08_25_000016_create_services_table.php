<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // Unique + indexed (unique index) — same slug convention as Categories/Brands.
            $table->string('slug')->unique();
            // Nullable: description is optional marketing copy.
            $table->text('description')->nullable();
            // Money columns — PKR figures stored to 2dp, same convention as products.price.
            // price_min ≤ price_max is enforced in the Services module service layer
            // (next build step), not as a DB constraint here.
            $table->decimal('price_min', 10, 2);
            $table->decimal('price_max', 10, 2);
            // Duration of the service in minutes — unsigned, realistic range 30–240.
            $table->unsignedInteger('duration_minutes');
            $table->boolean('is_published')->default(false)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
