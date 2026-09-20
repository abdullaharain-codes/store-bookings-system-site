<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use App\Modules\Services\Http\Requests\StoreServiceRequest;
use App\Modules\Services\Http\Requests\UpdateServiceRequest;
use App\Modules\Services\Services\ServiceService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    public function __construct(
        private readonly ServiceService $services,
        private readonly ServiceRepositoryInterface $serviceRepository,
    ) {}

    /**
     * Admin listing — includes unpublished services. Filters (search, status,
     * per_page) are passed straight through to the repository; pagination
     * metadata rides on Laravel's standard paginator envelope.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var LengthAwarePaginator $paginator */
        $paginator = $this->serviceRepository->findAllForAdmin(
            $request->only(['search', 'status', 'per_page']),
        );

        return response()->json($paginator->toArray());
    }

    public function show(Service $service): JsonResponse
    {
        return response()->json([
            'service' => $service,
        ]);
    }

    public function store(StoreServiceRequest $request): JsonResponse
    {
        $service = $this->services->createService($request->validated());

        return response()->json([
            'service' => $service,
        ], 201);
    }

    public function update(UpdateServiceRequest $request, Service $service): JsonResponse
    {
        $service = $this->services->updateService($service, $request->validated());

        return response()->json([
            'service' => $service->refresh(),
        ]);
    }

    public function destroy(Service $service): JsonResponse
    {
        $this->services->deleteService($service);

        return response()->json([
            'message' => 'Service deleted.',
        ]);
    }

    public function publish(Service $service): JsonResponse
    {
        $service = $this->services->publish($service);

        return response()->json([
            'service' => $service,
        ]);
    }

    public function unpublish(Service $service): JsonResponse
    {
        $service = $this->services->unpublish($service);

        return response()->json([
            'service' => $service,
        ]);
    }
}
