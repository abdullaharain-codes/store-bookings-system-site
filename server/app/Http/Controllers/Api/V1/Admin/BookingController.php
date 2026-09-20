<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceBooking;
use App\Modules\Scheduling\Http\Requests\AssignTechnicianRequest;
use App\Modules\Scheduling\Http\Requests\EnterFinalPriceRequest;
use App\Modules\Scheduling\Http\Requests\UpdateBookingStatusRequest;
use App\Modules\Scheduling\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(
        private readonly BookingService $bookingService,
    ) {}

    /**
     * GET /admin/bookings — all bookings, filterable (status, slot date
     * range, search, per_page). Envelope matches the customer list
     * ('bookings') so the admin screen reads the same shape as the calendar.
     */
    public function index(Request $request): JsonResponse
    {
        $bookings = $this->bookingService->listAllForAdmin(
            $request->only(['status', 'date_from', 'date_to', 'search', 'per_page']),
        );

        return response()->json([
            'bookings' => $bookings,
        ]);
    }

    /**
     * GET /admin/bookings/{booking} — any booking, no ownership restriction.
     */
    public function show(ServiceBooking $booking): JsonResponse
    {
        $booking = $this->bookingService->getBookingForAdmin($booking->id);

        return response()->json([
            'booking' => $booking,
        ]);
    }

    /**
     * POST /admin/bookings/{booking}/assign-technician — assign the
     * technician manually (PRD §10). Dedicated-endpoint shape mirrors
     * AdminServiceController's publish/unpublish.
     */
    public function assignTechnician(AssignTechnicianRequest $request, ServiceBooking $booking): JsonResponse
    {
        $booking = $this->bookingService->assignTechnician(
            $booking,
            (int) $request->validated('technician_id'),
        );

        return response()->json([
            'booking' => $booking,
        ]);
    }

    /**
     * PATCH /admin/bookings/{booking}/status — transition status.
     *
     * 'cancelled' routes to cancelBooking(isAdmin: true) → the PRD §10
     * "Admin can always override" path (exactly how AdminOrderController
     * routes 'cancelled' to cancelOrder). 'completed' is not allowed here —
     * completion requires the final price and goes through final-price.
     */
    public function updateStatus(UpdateBookingStatusRequest $request, ServiceBooking $booking): JsonResponse
    {
        $newStatus = $request->validated('status');

        if ($newStatus === 'cancelled') {
            $booking = $this->bookingService->cancelBooking(
                $request->user(),
                $booking,
                isAdmin: true,
            );
        } else {
            $booking = $this->bookingService->transitionStatus($booking, $newStatus);
        }

        return response()->json([
            'booking' => $booking,
        ]);
    }

    /**
     * POST /admin/bookings/{booking}/final-price — technician enters the
     * final actual price, which completes the booking (PRD §10).
     */
    public function enterFinalPrice(EnterFinalPriceRequest $request, ServiceBooking $booking): JsonResponse
    {
        $booking = $this->bookingService->enterFinalPrice(
            $booking,
            (float) $request->validated('final_price'),
        );

        return response()->json([
            'booking' => $booking,
        ]);
    }
}
