<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('entity');
            $table->unsignedBigInteger('entity_id');
            $table->string('action'); // e.g. created, updated, published, unpublished, deleted
            // Nullable: system/console-initiated actions have no authenticated actor.
            $table->foreignId('actor_id')->nullable()->index()->constrained('users')->nullOnDelete();
            // Nullable: not every event carries a structured payload.
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['entity', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
