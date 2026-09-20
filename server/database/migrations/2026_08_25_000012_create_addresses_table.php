<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: an address has no meaning without its owner.
            // The PRD has no guest checkout (PRD §5.2), so addresses always
            // belong to an authenticated user.
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Nullable: optional convenience label (e.g. "Home", "Office").
            // Not required — many users have only one address and don't label it.
            $table->string('label')->nullable();
            $table->string('recipient_name');
            $table->string('phone');
            $table->string('address_line_1');
            // Nullable: not all addresses have a second line.
            $table->string('address_line_2')->nullable();
            $table->string('city');
            // Nullable: not universally required in Pakistan — some rural
            // deliveries use landmarks or phone-based routing instead.
            $table->string('postal_code')->nullable();
            // Boolean: one default address per user (enforced at application
            // level in AddressService::setDefault — single-default invariant).
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            // Filtered by "get my addresses" on every address-list request
            // (rules.md §6).
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('addresses');
    }
};
