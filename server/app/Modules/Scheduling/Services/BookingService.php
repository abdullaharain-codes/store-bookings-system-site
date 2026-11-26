<?php

namespace App\Modules\Scheduling\Services;

use App\Models\Address;
use App\Models\BusinessSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Scheduling\Exceptions\SchedulingValidationException;
use App\Modules\Scheduling\Support\BookingCancellationReasons;
use App\Modules\Scheduling\Support\BookingRequestData;
use App\Shared\AuditLogger;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Cross-module orchestrator that turns a picked time window into a real
 * ServiceBooking, and enforces the customer cancellation rules.
 *
 * It coordinates two already-built pieces — the Phase 7 SlotHoldService and the
 * Phase 8 ServiceBooking entity — the same way CartService orchestrates stock
 * holds + cart rows: a single DB::transaction() keeps the whole flow atomic.
 */
class BookingService
{
    public function __construct(
        private readonly SlotHoldService $slotHold,
        private readonly AuditLogger $auditLogger,
        private readonly NotificationService $notificationService,
        private readonly ServiceableAreaService $serviceableAreas,
    ) {}

    /**
     * Confirm a booking for the given window: attempt a temporary hold, create
     * the ServiceBooking row (status 'pending'), then release the hold.
     *
     * Everything — service lookup, overlap guard, hold-attempt, row insert,
     * hold release — runs inside ONE DB::transaction(). A crash at any point
     * before commit rolls the WHOLE unit back, so a half-finished sequence can
     * never leave either an orphaned hold or a booking that no hold ever
     * guarded (the inner attemptHold's savepoint work is undone by the outer
     * rollback too).
     *
     * @throws SchedulingValidationException if the window is taken
     * @throws ResourceNotFoundException if the service does not exist, is
     *                                   unpublished, or the address (if given)
     *                                   does not belong to the user
     * @throws \InvalidArgumentException if startsAt >= endsAt
     */
    public function confirmBooking(User $user, BookingRequestData $data): ServiceBooking
    {
        // ── 1. Address ownership check (customer only) ──
        // An optional address must belong to the caller. Same pattern as
        // OrderService::placeOrder (which snapshots the address): the
        // FormRequest only verifies the row exists, the SERVICE owns the
        // ownership rule (rules.md §9) — never let one customer book with
        // another customer's address.
        $address = Address::find($data->addressId);

        if (! $address || $address->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }

        if ($user->gender === null) {
            throw new SchedulingValidationException(
                'Please set your gender in your profile before booking.',
            );
        }

        if ($address->map_link === null) {
            throw new SchedulingValidationException(
                'Please add a Google Maps link to this address before booking.',
            );
        }

        if (! $this->serviceableAreas->isServiceable($address->city)) {
            throw new SchedulingValidationException(
                'We do not currently serve '.$address->city.'. Please choose an address in a served area.',
            );
        }

        return DB::transaction(function () use ($user, $data, $address) {
            // Not-found pattern (architecture.md §10): missing and unpublished
            // are deliberately indistinguishable via the shared
            // ResourceNotFoundException (→ 404), matching how unpublished
            // products are handled in CartService's world.
            $service = Service::query()
                ->where('id', $data->serviceId)
                ->where('is_published', true)
                ->first();

            if (! $service) {
                throw new ResourceNotFoundException;
            }

            // The hold is the temporary "slot being picked" lock (Phase 7).
            // A concurrent confirmBooking for an overlapping window is
            // serialised here on SQLite (IMMEDIATE file lock) and MySQL
            // (lockForUpdate row locks on the checked windows).
            $hold = $this->slotHold->attemptHold($data->startsAt, $data->endsAt, $user->id);

            // Once a real booking exists, the window is reserved by the
            // booking row itself - an overlapping NON-cancelled booking blocks
            // this one. This is the "ServiceBooking's own status/window"
            // enforcement: the guard below is the minimal creation-time slice;
            // the full availability query is Phase 8.3's scope. It also closes
            // the window left by releasing the hold below: the moment the
            // winner commits, a waiting contender must NOT be able to book the
            // same window again.
            $this->assertNoOverlappingBooking($data->startsAt, $data->endsAt);

            $booking = ServiceBooking::query()->create([
                'user_id' => $user->id,
                'service_id' => $service->id,
                'address_id' => $address->id,
                'recipient_name' => $address->recipient_name,
                'phone' => $address->phone,
                'address_line_1' => $address->address_line_1,
                'address_line_2' => $address->address_line_2,
                'city' => $address->city,
                'postal_code' => $address->postal_code,
                'map_link' => $address->map_link,
                'customer_gender' => $user->gender,
                'scheduled_slot_start' => $data->startsAt,
                'scheduled_slot_end' => $data->endsAt,
                'status' => 'pending',
                'problem_description' => $data->problemDescription,
                'issue_type' => $data->issueType,
                'device_type' => $data->deviceType,
                'brand' => $data->brand,
                'model' => $data->model,
            ]);

            $this->auditLogger->log('ServiceBooking', $booking->id, 'created');

            // Release rather than keep: the booking row now permanently
            // represents this reservation, so a redundant expiring hold would
            // (a) double-book the same window in availability checks, (b)
            // expire out from under a confirmed booking, and (c) leak a
            // temporary row that needs cleanup. The hold's only job was to
            // serialise the critical section from "slot picked" to
            // "reservation persisted" — it is done at this point. Because the
            // release happens inside the same transaction, a crash before
            // commit rolls the hold back along with everything else.
            $this->slotHold->releaseHold($hold);

            return $booking;
        });
    }

    /**
     * Get a single booking with its service — ownership-checked.
     *
     * Exact mirror of OrderService::getOrder: findOrFail + manual ownership
     * guard. There is no way to tell "not your booking" from "no such booking"
     * (architecture.md §10) — both raise the shared ResourceNotFoundException.
     *
     * @throws ResourceNotFoundException
     */
    public function getBooking(User $user, int $bookingId): ServiceBooking
    {
        $booking = ServiceBooking::with('service')->findOrFail($bookingId);

        if ($booking->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }

        return $booking;
    }

    /**
     * List the user's bookings, paginated and ownership-scoped — the
     * "Service Booking History" of PRD §5.2. Mirrors OrderService::listOrders.
     */
    public function listBookings(User $user): LengthAwarePaginator
    {
        return ServiceBooking::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->paginate(15);
    }

    /**
     * Upcoming, non-terminal bookings for the dashboard overview: status not
     * 'completed'/'cancelled', slot not yet started, soonest first, capped at
     * $limit (default 3).
     *
     * Ownership is scoped explicitly by user_id — never incidental. The
     * service relation is eager-loaded with only the columns the dashboard
     * renders (id, name) so the mapped response is N+1-free: exactly one
     * bookings SELECT plus one services IN(...) SELECT.
     */
    public function upcomingBookings(User $user, int $limit = 3): Collection
    {
        return ServiceBooking::query()
            ->with('service:id,name')
            ->where('user_id', $user->id)
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->where('scheduled_slot_start', '>=', now())
            ->orderBy('scheduled_slot_start')
            ->limit($limit)
            ->get();
    }

    /**
     * The COMPLETED booking of this service owned by the user, if any — the
     * eligibility proof that grants a service review (ReleasePlan §12).
     *
     * Returns the booking id (recorded on the review as source_id) or null.
     * Written here on the owning module's service so Reviews never queries
     * service_bookings directly (architecture.md §3). A single value() SELECT
     * — no booking rows are materialized (rules.md §10).
     */
    public function findCompletedBookingForService(User $user, int $serviceId): ?int
    {
        return ServiceBooking::query()
            ->where('user_id', $user->id)
            ->where('service_id', $serviceId)
            ->where('status', 'completed')
            ->value('id');
    }

    /**
     * Admin listing — ALL bookings, no ownership scoping (Phase 8 "Admin
     * Bookings (list + calendar)"). Mirrors OrderService::listAllForAdmin.
     *
     * Supported filters (all optional):
     *   - status      exact status match
     *   - date_from   scheduled_slot_start >= date (calendar start)
     *   - date_to     scheduled_slot_start <= date, end of day (calendar end)
     *   - search      free-text over the customer's name/email and the
     *                 booking's problem_description
     *   - per_page
     */
    public function listAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        $query = ServiceBooking::query()
            ->with(['service', 'technician', 'user', 'address'])
            ->orderByDesc('scheduled_slot_start');

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['date_from'])) {
            $query->where('scheduled_slot_start', '>=', Carbon::parse($filters['date_from']));
        }

        if (! empty($filters['date_to'])) {
            $query->where('scheduled_slot_start', '<=', Carbon::parse($filters['date_to'])->endOfDay());
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('problem_description', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($uq) use ($search) {
                        $uq->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        return $query->paginate($filters['per_page'] ?? 15);
    }

    /**
     * Get any booking, no ownership restriction — admin context.
     *
     * Mirrors OrderService::getOrderForAdmin (which eager-loads items);
     * bookings eager-load the relations the admin UI reads on one screen.
     */
    public function getBookingForAdmin(int $bookingId): ServiceBooking
    {
        return ServiceBooking::with(['service', 'address', 'technician', 'user'])
            ->findOrFail($bookingId);
    }

    /**
     * Assign the technician to a booking (admin-only) — PRD §10 "Technician
     * assignment: single technician (client), manually assigned".
     *
     * The technician is a plain User id. architecture.md §12: the
     * single-technician assumption is a DATA VALUE, not a schema constraint
     * ("not hard-coded to single-technician"), and this project has no
     * technician role (only customer/admin exist) — so any existing user id is
     * accepted; a role system is NOT invented here. Only the referential
     * validity is enforced: a non-existent id is indistinguishable from a
     * guessed one (ResourceNotFoundException → 404).
     *
     * Terminal bookings (cancelled/completed) are fixed records — reassigning
     * a technician after the fact makes no sense and is rejected.
     *
     * @throws ResourceNotFoundException if the technician id does not exist
     * @throws SchedulingValidationException if the booking is terminal
     */
    public function assignTechnician(ServiceBooking $booking, int $technicianId): ServiceBooking
    {
        if (! in_array($booking->status, ['pending', 'confirmed', 'technician_on_the_way'], true)) {
            throw new SchedulingValidationException(
                "Cannot assign a technician to a {$booking->status} booking.",
            );
        }

        $technician = User::find($technicianId);

        if (! $technician) {
            throw new ResourceNotFoundException;
        }

        $booking->update(['technician_id' => $technician->id]);

        $this->auditLogger->log('ServiceBooking', $booking->id, 'technician_assigned', [
            'technician_id' => $technician->id,
        ]);

        return $booking;
    }

    /**
     * Transition a booking to a new status (admin-only).
     *
     * Status graph (mirrors OrderService::status graph):
     *   pending → confirmed → technician_on_the_way
     *   'completed' and 'cancelled' are terminal, and NOT reachable through
     *   this method — completion happens ONLY via enterFinalPrice() (the
     *   price is required ON completion, PRD §10), and cancellation routes
     *   to cancelBooking(isAdmin: true) exactly as AdminOrderController
     *   routes 'cancelled' to cancelOrder.
     *
     * @throws SchedulingValidationException if the transition is invalid
     */
    public function transitionStatus(ServiceBooking $booking, string $newStatus): ServiceBooking
    {
        $this->validateTransition($booking->status, $newStatus);

        $previousStatus = $booking->status;

        $booking = DB::transaction(function () use ($booking, $newStatus, $previousStatus) {
            $booking->update(['status' => $newStatus]);

            $this->auditLogger->log('ServiceBooking', $booking->id, 'status_changed', [
                'from' => $previousStatus,
                'to' => $newStatus,
            ]);

            return $booking;
        });

        // Notify AFTER the transaction commits — the Task 11.0 boundary is
        // deliberately NOT widened to include the notification (rules.md §3
        // SRP). NotificationService swallows its own failures, so a failed
        // send can never roll back or fail the transition (SRS §6.4).
        $this->notificationService->notifyBookingStatusChanged($booking, $previousStatus);

        return $booking;
    }

    /**
     * Enter the technician's final actual price (admin-only) — PRD §10:
     * "technician enters final actual price on completion".
     *
     * Ordering decision (PRD line 144 is the settling wording): entering the
     * price IS the completion action — it transitions technician_on_the_way →
     * completed in the same step. The booking must have a dispatched
     * technician (status 'technician_on_the_way') to be completed; a booking
     * can never reach 'completed' with a null final_price, which would
     * violate both the pricing rule and PRD §11's final-price auditability.
     * Mirrors OrderService::transitionStatus('delivered') folding the money
     * touch (payment_status='paid') into the completion step.
     *
     * @throws SchedulingValidationException if status is not technician_on_the_way
     */
    public function enterFinalPrice(ServiceBooking $booking, float $finalPrice): ServiceBooking
    {
        if ($booking->status !== 'technician_on_the_way') {
            throw new SchedulingValidationException(
                'Final price can only be entered to complete a booking whose technician has been dispatched.',
            );
        }

        $booking = DB::transaction(function () use ($booking, $finalPrice) {
            $formatted = number_format($finalPrice, 2, '.', '');

            $booking->update(['status' => 'completed', 'final_price' => $formatted]);

            $this->auditLogger->log('ServiceBooking', $booking->id, 'final_price_entered', [
                'final_price' => $formatted,
            ]);

            return $booking;
        });

        // Notify AFTER the commit, and ONLY the final-price notification —
        // entering the price IS the completion action (PRD §10), so firing a
        // status-change notification too would double-notify the customer for
        // one business action. Failure is swallowed inside NotificationService
        // (SRS §6.4), so it can never fail the committed completion.
        $this->notificationService->notifyBookingFinalPriceEntered($booking);

        return $booking;
    }

    /**
     * Cancellation/reschedule rule (PRD §10), enforced in the business layer.
     *
     * Mirrors OrderService::cancelOrder's shape: the caller + explicit
     * $isAdmin flag. Customers may only cancel their OWN bookings, and only
     * subject to the customer rules below. PRD §10's "Admin can always
     * override" (confirmed: the admin is the exception attached to the whole
     * customer-rule cell) means isAdmin bypasses BOTH the ownership check AND
     * the customer cancellation restrictions — matching how OrderService's
     * isAdmin bypasses customer-only status restrictions.
     *
     * Precedence:
     *   1. Ownership check (customer only) — same exception/pattern as
     *      OrderService::cancelOrder (architecture.md §10): 404 with no way to
     *      distinguish "not yours" from "not found". Fires first for non-admins.
     *   2. TERMINAL data-integrity guards — 'completed' (a finished job with a
     *      recorded final_price is a historical fact, not a restriction the
     *      admin-override was ever meant to bypass) and 'cancelled' (idempotent
     *      no-op rejection, mirroring OrderService::cancelOrder's delivered/
     *      cancelled guards) are blocked UNCONDITIONALLY, i.e. even when
     *      isAdmin is true and before any bypassable rule is evaluated.
     *   3. Customer cancellation rules (isAdmin bypasses both): the "Technician
     *      On The Way" status is a SYSTEM hard rule (PRD §9 — not
     *      admin-editable, admin settings can never weaken it), checked first
     *      of the two and winning outright regardless of how far out the slot
     *      is. Only if that passes is the time-based cutoff considered:
     *      cancellation is allowed when at least the configured cutoff
     *      (cancellation_cutoff_minutes, default 120 = PRD's "2 hrs pre-slot")
     *      still remains before the slot.
     *
     * @throws ResourceNotFoundException if the customer does not own the booking
     * @throws SchedulingValidationException if the booking is terminal or a
     *                                       customer rule blocks
     */
    public function cancelBooking(User $user, ServiceBooking $booking, bool $isAdmin = false): ServiceBooking
    {
        // ── 1. Ownership check (customer only) ──
        // Same exception/pattern as OrderService::cancelOrder (architecture.md
        // §10): 404 with no way to distinguish "not yours" from "not found".
        if (! $isAdmin && $booking->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }

        // ── 2. Terminal data-integrity guards (unconditional — isAdmin skips
        //        nothing here). Mirror of OrderService::cancelOrder: a
        //        delivered/completed or already-cancelled record is a
        //        historical fact that must not be rewritten. ──
        if ($booking->status === 'completed') {
            throw new SchedulingValidationException(
                'A completed booking cannot be cancelled.',
            );
        }

        if ($booking->status === 'cancelled') {
            throw new SchedulingValidationException(
                'This booking has already been cancelled.',
            );
        }

        // ── 3. Customer cancellation rules (admin bypasses both) ──
        if (! $isAdmin && $booking->status === 'technician_on_the_way') {
            throw new SchedulingValidationException(
                'This booking cannot be cancelled because the technician is already on the way.',
            );
        }

        $cutoffMinutes = (int) BusinessSetting::getValue('cancellation_cutoff_minutes', 120);

        // Cancelling when now is at/after (slot start - cutoff) is blocked —
        // includes slots already in progress or in the past.
        $cutoff = $booking->scheduled_slot_start->copy()->subMinutes($cutoffMinutes);

        if (! $isAdmin && now()->greaterThanOrEqualTo($cutoff)) {
            throw new SchedulingValidationException(
                "Bookings can only be cancelled at least {$cutoffMinutes} minutes before the scheduled slot.",
            );
        }

        $previousStatus = $booking->status;

        // The mutation (update + audit) runs atomically — the exact Task 11.0
        // pattern from transitionStatus() and enterFinalPrice(). All guards
        // above (ownership, terminal states, the 2-hour cutoff) stay OUTSIDE
        // the transaction: they validate, they do not write.
        $booking = DB::transaction(function () use ($booking, $previousStatus, $isAdmin) {
            $booking->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancellation_reason' => $isAdmin
                    ? BookingCancellationReasons::ADMIN
                    : BookingCancellationReasons::CUSTOMER,
            ]);

            $this->auditLogger->log('ServiceBooking', $booking->id, 'cancelled', [
                'previous_status' => $previousStatus,
                'cancelled_by' => $isAdmin ? 'admin' : 'customer',
            ]);

            return $booking;
        });

        // Notify AFTER the commit, reusing the Step 11.3 class/method — same
        // boundary + swallow pattern as the other transitions (SRS §6.4).
        $this->notificationService->notifyBookingStatusChanged($booking, $previousStatus);

        return $booking;
    }

    /**
     * Reschedule a booking: cancel the old row and create a new booking in the
     * same transaction. Snapshots/complaint data are copied from the old
     * booking; the new slot is validated with the same hold/overlap rules as
     * confirmBooking.
     *
     * @throws ResourceNotFoundException
     * @throws SchedulingValidationException
     */
    public function rescheduleBooking(
        User $actor,
        ServiceBooking $booking,
        Carbon $startsAt,
        Carbon $endsAt,
        bool $isAdmin = false,
        ?string $reason = null,
    ): ServiceBooking {
        if (! $isAdmin && $booking->user_id !== $actor->id) {
            throw new ResourceNotFoundException;
        }

        if ($booking->status === 'completed') {
            throw new SchedulingValidationException('A completed booking cannot be rescheduled.');
        }

        if ($booking->status === 'cancelled') {
            throw new SchedulingValidationException('A cancelled booking cannot be rescheduled.');
        }

        if ($booking->status === 'technician_on_the_way') {
            throw new SchedulingValidationException(
                'This booking cannot be rescheduled because the technician is already on the way.',
            );
        }

        if (! in_array($booking->status, ['pending', 'confirmed'], true)) {
            throw new SchedulingValidationException('Only pending or confirmed bookings can be rescheduled.');
        }

        $cutoffMinutes = (int) BusinessSetting::getValue('cancellation_cutoff_minutes', 120);
        $cutoff = $booking->scheduled_slot_start->copy()->subMinutes($cutoffMinutes);
        if (! $isAdmin && now()->greaterThanOrEqualTo($cutoff)) {
            throw new SchedulingValidationException(
                "Bookings can only be rescheduled at least {$cutoffMinutes} minutes before the scheduled slot.",
            );
        }

        if ($booking->scheduled_slot_start->equalTo($startsAt) && $booking->scheduled_slot_end->equalTo($endsAt)) {
            throw new SchedulingValidationException('The new booking slot must be different from the current slot.');
        }

        $oldBookingId = $booking->id;

        $newBooking = DB::transaction(function () use ($actor, $booking, $startsAt, $endsAt, $isAdmin, $reason, $oldBookingId) {
            $booking = ServiceBooking::query()->whereKey($oldBookingId)->lockForUpdate()->firstOrFail();

            if (! $isAdmin && $booking->user_id !== $actor->id) {
                throw new ResourceNotFoundException;
            }

            if ($booking->status === 'completed') {
                throw new SchedulingValidationException('A completed booking cannot be rescheduled.');
            }

            if ($booking->status === 'cancelled') {
                throw new SchedulingValidationException('A cancelled booking cannot be rescheduled.');
            }

            if ($booking->status === 'technician_on_the_way') {
                throw new SchedulingValidationException(
                    'This booking cannot be rescheduled because the technician is already on the way.',
                );
            }

            if (! in_array($booking->status, ['pending', 'confirmed'], true)) {
                throw new SchedulingValidationException('Only pending or confirmed bookings can be rescheduled.');
            }

            $previousStatus = $booking->status;

            // Cancel the old row FIRST so its own window does not block the new
            // booking when windows overlap (e.g. shifting by 30 minutes).
            $booking->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancellation_reason' => BookingCancellationReasons::RESCHEDULED,
                'cancellation_note' => $isAdmin ? $reason : null,
            ]);

            $service = Service::query()
                ->where('id', $booking->service_id)
                ->where('is_published', true)
                ->first();

            if (! $service) {
                throw new ResourceNotFoundException;
            }

            $hold = $this->slotHold->attemptHold($startsAt, $endsAt, $actor->id);
            $this->assertNoOverlappingBooking($startsAt, $endsAt);

            $newBooking = ServiceBooking::query()->create([
                'user_id' => $booking->user_id,
                'service_id' => $booking->service_id,
                'technician_id' => $booking->technician_id,
                'address_id' => $booking->address_id,
                'recipient_name' => $booking->recipient_name,
                'phone' => $booking->phone,
                'address_line_1' => $booking->address_line_1,
                'address_line_2' => $booking->address_line_2,
                'city' => $booking->city,
                'postal_code' => $booking->postal_code,
                'map_link' => $booking->map_link,
                'customer_gender' => $booking->customer_gender,
                'scheduled_slot_start' => $startsAt,
                'scheduled_slot_end' => $endsAt,
                'status' => $previousStatus,
                'problem_description' => $booking->problem_description,
                'issue_type' => $booking->issue_type,
                'device_type' => $booking->device_type,
                'brand' => $booking->brand,
                'model' => $booking->model,
                'rescheduled_from_id' => $booking->id,
            ]);

            $this->auditLogger->log('ServiceBooking', $booking->id, 'rescheduled', [
                'new_booking_id' => $newBooking->id,
                'previous_status' => $previousStatus,
                'cancelled_by' => $isAdmin ? 'admin' : 'customer',
                'reason' => $isAdmin ? $reason : null,
            ]);
            $this->auditLogger->log('ServiceBooking', $newBooking->id, 'created');

            $this->slotHold->releaseHold($hold);

            return $newBooking;
        });

        $this->notificationService->notifyBookingRescheduled($newBooking, $booking, $isAdmin, $reason);

        return $newBooking;
    }

    /**
     * The booking-row half of double-booking prevention: an overlapping
     * NON-cancelled booking owns its window. Half-open [start, end) overlap,
     * the same predicate as slot_holds, served by the composite
     * (scheduled_slot_start, scheduled_slot_end) index.
     *
     * @throws SchedulingValidationException
     */
    private function assertNoOverlappingBooking(Carbon $startsAt, Carbon $endsAt): void
    {
        $overlapping = ServiceBooking::query()
            ->notCancelled()
            ->overlappingWith($startsAt, $endsAt)
            ->lockForUpdate()
            ->first();

        if ($overlapping) {
            throw new SchedulingValidationException(
                'This time slot is no longer available. Please choose a different time.',
            );
        }
    }

    /**
     * Validate that a status transition is allowed — the booking state
     * machine. Mirror of OrderService::validateTransition (rules.md §3 DRY);
     * 'completed' is intentionally NOT in the graph because completion has a
     * required side-effect (the final actual price, PRD §10) and is therefore
     * only reachable via enterFinalPrice().
     *
     * @throws SchedulingValidationException if the transition is not in the graph
     */
    private function validateTransition(string $from, string $to): void
    {
        $transitions = [
            'pending' => ['confirmed'],
            'confirmed' => ['technician_on_the_way'],
            'technician_on_the_way' => [],
        ];

        $allowed = $transitions[$from] ?? [];

        if (! in_array($to, $allowed, true)) {
            throw new SchedulingValidationException(
                "Cannot transition from \"{$from}\" to \"{$to}\".",
            );
        }
    }
}
