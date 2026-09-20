<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carts', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: a cart has no meaning without its owner — the
            // PRD has no guest checkout (PRD §5.2), so server-side carts only
            // ever belong to an authenticated user. Guest cart-in-progress
            // before login lives in frontend pending-action state
            // (architecture.md §2), never in this table.
            // unique(): one live cart per user; re-adding to a cart means
            // updating items, not spawning a second cart.
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('carts');
    }
};
