<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: a deleted customer's reviews go with them (an
            // unattributed review is meaningless). Deliberately NOT restrict
            // like orders/service_bookings — those are permanent business
            // records; a review is user-authored content, same as wishlists.
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Exactly one of the two targets is set per review; the other
            // stays null. nullOnDelete mirrors order_items.product_id: a
            // removed product/service keeps the historical review row
            // (source_id + verified_source still identify what it was about).
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignId('service_id')->nullable()->constrained('services')->nullOnDelete();
            // rating 1..5 — the range is enforced in the service layer
            // (ReleasePlan §11); the column is unsigned so a negative can never
            // be persisted even by a DBA-level mistake.
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            // Which purchase fact granted the write: 'order' (a delivered
            // order containing the product) or 'service_booking' (a completed
            // booking of the service).
            $table->enum('verified_source', ['order', 'service_booking']);
            // The concrete row that granted access (orders.id OR
            // service_bookings.id) — traceability without a polymorphic FK.
            $table->unsignedBigInteger('source_id')->nullable();
            $table->boolean('is_published')->default(true);
            $table->timestamps();

            // A customer reviews a product/service at most once (PRD §11,
            // ReleasePlan §11) — hard database-level backstop for the
            // service-layer duplicate check.
            $table->unique(['user_id', 'product_id']);
            $table->unique(['user_id', 'service_id']);

            // Public read paths: published reviews for a given target.
            $table->index(['product_id', 'is_published']);
            $table->index(['service_id', 'is_published']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};
