<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    public function __construct(
        private readonly ServiceRepositoryInterface $services,
    ) {}

    /**
     * Public, published-only service listing, paginated. ?per_page rides along
     * like on every other list endpoint; ?page= is consumed by the paginator.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->services->findPublished(
            (int) ($request->query('per_page', 15)),
        );

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
}
