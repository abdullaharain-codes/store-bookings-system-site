<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The confirmed service booking (architecture.md §4). The booking
        // holds the CONFIRMED window [scheduled_slot_start, scheduled_slot_end)
        // half-open exactly like slot_holds — this is what permanently replaces
        // and consumes a SlotHold once the booking flow is wired (Phase 8 Step 8.2).
        //
        // ── FKs & delete behavior ──
        // user_id    restrictOnDelete (mirrors the Orders convention:
        //            a booking is a permanent business record and must never
        //            silently cascade-delete if the customer account is removed).
        // service_id restrictOnDelete (same permanence argument — a service in
        //            use by any booking cannot be silently deleted).
        // address_id restrictOnDelete — DELIBERATE DEVIATION from orders'
        //            nullOnDelete: orders snapshot their address fields, so
        //            severing that FK is cosmetic. Bookings do NOT snapshot
        //            (no recipient_*/address_* columns exist), so the booking's
        //            service location IS the address row; deleting it would
        //            silently orphan where the technician must go. Nullable
        //            while the booking has not completed address resolution
        //            in the wizard.
        // technician_id nullable nullOnDelete — PER architecture.md §12: the
        //            single-technician assumption is a DATA VALUE, not a
        //            schema constraint; technicianId exists from V1, nullable
        //            until manually assigned (PRD §10 "Technician assignment").
        //            A deleted technician account severs the link cosmetically
        //            only; AuditLog retains who/when.
        // rescheduled_from_id self-FK nullOnDelete — a booking origin link;
        //            if admin cleanup ever removes the origin row, the
        //            reschedule chain breaks to null rather than blocking
        //            (the reschedule event is already in AuditLog).
        //
        // ── Nullable fields (rules.md §6: documented reason) ──
        // final_price        null until completion — PRD §10: "technician
        //                    enters final actual price on completion".
        // problem_description null — the wizard's "problem" step is optional.
        // cancelled_at       null until the booking is cancelled (PRD §10
        //                    cancellation rule).
        Schema::create('service_bookings', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('service_id')->constrained('services')->restrictOnDelete();
            $table->foreignId('technician_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('address_id')->nullable()->constrained('addresses')->restrictOnDelete();

            // Confirmed booking window, half-open [start, end) — the same
            // overlap-query shape as slot_holds (starts_at < ? AND ends_at > ?).
            $table->dateTime('scheduled_slot_start');
            $table->dateTime('scheduled_slot_end');

            // Plain string + app-level validation, mirroring Order.status
            // (rules.md §6; orders migration convention — not a DB enum).
            // Vocabulary — confirmed against PRD §9/§10 and phases.md:
            //   technician_on_the_way  literal PRD status "Technician On The Way"
            //                          (hard-block for cancellation/reschedule)
            //   completed / cancelled  PRD §10 (final price on completion;
            //                          customer cancellation rule)
            //   pending / confirmed    pre-inbound lifecycle, same
            //                          pending→confirmed shape already
            //                          established on Order.status
            $table->string('status')->default('pending');

            $table->text('problem_description')->nullable();

            $table->decimal('final_price', 10, 2)->nullable();

            $table->dateTime('cancelled_at')->nullable();

            $table->foreignId('rescheduled_from_id')->nullable()->constrained('service_bookings')->nullOnDelete();

            $table->timestamps();

            // architecture.md §4.2: composite index on the booking window for
            // overlap/double-booking checks (supercedes slot_holds on confirm).
            $table->index(['scheduled_slot_start', 'scheduled_slot_end']);
            // Frequently filtered (rules.md §6) — admin list/calendar by status.
            $table->index('status');
            // Customer's own bookings lookup — scoped to a user (rules.md §6,
            // ownership checks per architecture.md §5).
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_bookings');
    }
};
