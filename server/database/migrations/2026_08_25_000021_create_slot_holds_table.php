<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Temporary holds on a booking time window while a customer is
        // mid-booking (architecture.md §4.2). The held window is a half-open
        // interval [starts_at, ends_at): a slot starting exactly when another
        // ends does NOT overlap it.
        //
        // held_by_user_id is nullable BY DESIGN: some booking-entry flows do
        // not yet have a resolved auth context when the hold is first taken
        // (e.g. guest-initiated holds that get attached to a user once the
        // flow resolves identity). It is null until a user is known.
        //
        // expires_at is the LIVE availability mechanism (the same principle as
        // cart holds): every overlap/availability check filters
        // expires_at > now(), so an expired hold is functionally invisible
        // without any cleanup job having run. There is NO correctness
        // dependency on a cleanup cron.
        Schema::create('slot_holds', function (Blueprint $table) {
            $table->id();

            $table->dateTime('starts_at');
            $table->dateTime('ends_at');

            $table->foreignId('held_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->dateTime('expires_at')->index();

            // architecture.md §4.2 explicitly prescribes a composite index on
            // (starts_at, ends_at) for the overlap-detection query
            // (starts_at < ? AND ends_at > ?).
            $table->index(['starts_at', 'ends_at']);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('slot_holds');
    }
};
