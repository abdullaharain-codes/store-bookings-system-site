<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ServiceBooking;
use App\Modules\Scheduling\Http\Requests\StoreBookingRequest;
use App\Modules\Scheduling\Services\BookingService;
use App\Modules\Scheduling\Support\BookingRequestData;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(
        private readonly BookingService $bookingService,
    ) {}

    /**
     * POST /bookings — confirm a booking for the customer's picked window.
     *
     * The wizard payload is validated by StoreBookingRequest; address ownership
     * and window availability are enforced inside BookingService (rules.md §9
     * — ownership is a service-layer rule, not controller/request logic).
     */
    public function store(StoreBookingRequest $request): JsonResponse
    {
        $window = $request->window();

        $booking = $this->bookingService->confirmBooking(
            $request->user(),
            BookingRequestData::fromValidated($request->validated(), $window),
        );

        return response()->json([
            'booking' => $booking->load('service'),
        ], 201);
    }

    /**
     * GET /bookings — the authenticated customer's own bookings, paginated
     * (PRD §5.2 "Service Booking History").
     */
    public function index(Request $request): JsonResponse
    {
        $bookings = $this->bookingService->listBookings($request->user());

        return response()->json([
            'bookings' => $bookings,
        ]);
    }

    /**
     * GET /bookings/{booking} — a single booking, ownership-checked in the
     * service layer (404 if it is not the caller's, indistinguishable from a
     * missing id — same pattern as getBooking mirrors getOrder).
     */
    public function show(Request $request, ServiceBooking $booking): JsonResponse
    {
        $booking = $this->bookingService->getBooking($request->user(), $booking->id);

        return response()->json([
            'booking' => $booking,
        ]);
    }

    /**
     * POST /bookings/{booking}/cancel — customer cancels their own booking.
     *
     * Allowed only while the PRD §10 customer rules pass (> cutoff out,
     * not technician_on_the_way) — otherwise the SchedulingValidationException
     * propagates to the centralized handler as 422. Ownership fails (404)
     * before any cancellation rule is evaluated.
     */
    public function cancel(Request $request, ServiceBooking $booking): JsonResponse
    {
        $booking = $this->bookingService->cancelBooking($request->user(), $booking);

        return response()->json([
            'booking' => $booking,
        ]);
    }
}
