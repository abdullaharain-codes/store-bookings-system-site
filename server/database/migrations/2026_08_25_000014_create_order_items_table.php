<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: if an order is removed, its line items go with it.
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            // nullOnDelete: the order_item keeps snapshot fields (product_name,
            // product_sku, unit_price) so it survives product deletion.  The FK
            // becomes null, but the record and its pricing data remain intact.
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            // ── Product snapshot (copied at order time) ──
            // product_name and product_sku: a product rename or SKU reassignment
            // after order placement must not change the order history.
            $table->string('product_name');
            $table->string('product_sku');
            // unit_price: the price the customer actually paid — same snapshot
            // principle as recipient_address fields on the order.
            $table->decimal('unit_price', 10, 2);
            // unsigned: quantity can never be negative.
            $table->unsignedInteger('quantity');
            // line_total = unit_price * quantity, stored for query convenience.
            $table->decimal('line_total', 10, 2);
            $table->timestamps();

            // Scoped to an order for "get order items" loads (rules.md §6).
            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
