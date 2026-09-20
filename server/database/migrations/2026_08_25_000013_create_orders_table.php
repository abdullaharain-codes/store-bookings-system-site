<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            // Unique human-readable identifier (e.g. ORD-2026-A1B2C3D4E5F6).
            // Generated at order-creation time; never reused.
            $table->string('order_number')->unique();
            // restrictOnDelete: an order is a permanent business record and
            // must never silently cascade-delete if a user account is removed.
            // Admin account cleanup must handle orphaned orders explicitly.
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            // nullOnDelete: the order keeps its own SNAPSHOT of address fields
            // (see recipient_* columns below), so losing the FK link is
            // cosmetic, not data-loss.  The address can be safely deleted
            // after order placement without affecting order history.
            $table->foreignId('address_id')->nullable()->constrained('addresses')->nullOnDelete();
            // ── Address snapshot (copied at order time) ──
            // These fields ensure a later address edit or delete never
            // changes a placed order (same snapshot principle as price).
            $table->string('recipient_name');
            $table->string('phone');
            $table->string('address_line_1');
            $table->string('address_line_2')->nullable();
            $table->string('city');
            $table->string('postal_code')->nullable();
            // ── Pricing ──
            // decimal(10,2): PKR values up to 99,999,999.99 with two
            // decimal places — more than sufficient for Pakistani e-commerce.
            $table->decimal('subtotal', 10, 2);
            $table->decimal('shipping_fee', 10, 2);
            $table->decimal('total', 10, 2);
            // ── Status fields ──
            // Plain string column with app-level validation (rules.md §6).
            // Values: pending, confirmed, shipped, delivered, cancelled.
            $table->string('status')->default('pending');
            // COD scaffolding: 'pending' until admin marks 'paid' on delivery.
            // Not fully wired until Phase 5 admin order management.
            $table->string('payment_status')->default('pending');
            $table->timestamps();

            // Scoped to a user for "my orders" list (rules.md §6).
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
