<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Scheduling\Http\Requests\ServiceAvailabilityRequest;
use App\Modules\Scheduling\Services\ServiceAvailabilityService;
use App\Modules\Scheduling\Support\BusinessClock;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use App\Support\PerPage;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ServiceController extends Controller
{
    public function __construct(
        private readonly ServiceRepositoryInterface $services,
        private readonly BusinessClock $businessClock,
    ) {}

    /**
     * Public, published-only service listing, paginated. per_page is clamped
     * to 1..48 through the same PerPage helper as /products; ?page= is
     * consumed by the paginator.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->services->findPublished(PerPage::fromRequest($request));

        return response()->json($paginator->toArray());
    }

    /**
     * Published-only detail lookup by slug. Missing AND unpublished slugs both
     * return the identical 404 — an unpublished service must be unreachable
     * via the public API without leaking that it exists (IDOR-safe per
     * architecture.md §10).
     */
    public function show(string $slug): JsonResponse
    {
        $service = $this->services->findBySlug($slug);

        if (! $service || ! $service->is_published) {
            abort(404);
        }

        return response()->json([
            'service' => $service,
        ]);
    }

    /**
     * Public availability for the booking wizard's date/time step (Phase 7).
     *
     * Deliberately thin (rules.md §3): the slug lookup and the identical
     * missing-vs-unpublished 404 mirror show() exactly, and every scheduling rule
     * lives in ServiceAvailabilityService — none is restated here.
     *
     * Two modes on one route, because phases.md Phase 7 lists "nearest-slot
     * suggestion logic" as part of the engine rather than a second endpoint:
     *   ?date=2026-09-21              → that day's bookable slots
     *   ?date=2026-09-21&mode=nearest → that day's slots plus the first bookable
     *                                     slot at or after it, walking forward
     *                                     across closed days
     */
    public function availability(
        ServiceAvailabilityRequest $request,
        ServiceAvailabilityService $availability,
        string $slug,
    ): JsonResponse {
        $service = $this->services->findBySlug($slug);

        if (! $service || ! $service->is_published) {
            abort(404);
        }

        $date = Carbon::createFromFormat('Y-m-d', $request->validated('date'))->startOfDay();

        $payload = [
            'service' => [
                'id' => $service->id,
                'slug' => $service->slug,
                'duration_minutes' => $service->duration_minutes,
            ],
            'date' => $date->toDateString(),
            // The zone the SCHEDULE is expressed in (TZ1), which is not
            // necessarily config('app.timezone'). Slots below carry this zone's
            // offset, so a client can render 09:00 to a Karachi customer and
            // still send an unambiguous instant back.
            'timezone' => $this->businessClock->timezone(),
            'slots' => array_map(
                fn (array $slot) => $this->formatSlot($slot),
                $availability->slotsFor($service, $date),
            ),
        ];

        if ($request->validated('mode') === 'nearest') {
            $nearest = $availability->nearestSlotFor($service, $date);

            $payload['nearest_slot'] = $nearest ? $this->formatSlot($nearest) : null;
        }

        return response()->json($payload);
    }

    /**
     * ISO-8601 WITH an explicit offset, rendered in the business timezone so the
     * wall-clock time matches what the customer sees on the shop's sign. The
     * offset is always present, so the instant is unambiguous either way.
     *
     * @param  array{start: Carbon, end: Carbon}  $slot
     * @return array{start: string, end: string}
     */
    private function formatSlot(array $slot): array
    {
        return [
            'start' => $this->businessClock->toBusiness($slot['start'])->toIso8601String(),
            'end' => $this->businessClock->toBusiness($slot['end'])->toIso8601String(),
        ];
    }
}
