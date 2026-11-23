<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BusinessHour;
use App\Modules\Scheduling\Contracts\BusinessHourRepositoryInterface;
use App\Modules\Scheduling\Http\Requests\StoreBusinessHourRequest;
use App\Modules\Scheduling\Http\Requests\UpdateBusinessHourRequest;
use App\Shared\AuditLogger;
use Illuminate\Http\JsonResponse;

class BusinessHourController extends Controller
{
    public function __construct(
        private readonly BusinessHourRepositoryInterface $businessHours,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'business_hours' => $this->businessHours->all(),
        ]);
    }

    public function show(BusinessHour $businessHour): JsonResponse
    {
        return response()->json([
            'business_hour' => $businessHour,
        ]);
    }

    public function store(StoreBusinessHourRequest $request): JsonResponse
    {
        $data = $this->normalized($request->validated());
        $businessHour = BusinessHour::query()->create($data);

        $this->auditLogger->log('BusinessHour', $businessHour->id, 'created', [
            'day_of_week' => $businessHour->day_of_week,
        ]);

        return response()->json([
            'business_hour' => $businessHour->refresh(),
        ], 201);
    }

    public function update(UpdateBusinessHourRequest $request, BusinessHour $businessHour): JsonResponse
    {
        $data = $this->normalized($request->validated());
        $businessHour->update($data);

        $this->auditLogger->log('BusinessHour', $businessHour->id, 'updated', [
            'day_of_week' => $businessHour->day_of_week,
        ]);

        return response()->json([
            'business_hour' => $businessHour->refresh(),
        ]);
    }

    public function destroy(BusinessHour $businessHour): JsonResponse
    {
        $id = $businessHour->id;
        $day = $businessHour->day_of_week;
        $businessHour->delete();

        $this->auditLogger->log('BusinessHour', $id, 'deleted', [
            'day_of_week' => $day,
        ]);

        return response()->json([
            'message' => 'Business hour deleted.',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalized(array $data): array
    {
        $isClosed = (bool) ($data['is_closed'] ?? false);
        $data['is_closed'] = $isClosed;

        if ($isClosed) {
            $data['opens_at'] = null;
            $data['closes_at'] = null;

            return $data;
        }

        $data['opens_at'] = $this->normalizeTime($data['opens_at'] ?? null);
        $data['closes_at'] = $this->normalizeTime($data['closes_at'] ?? null);

        return $data;
    }

    private function normalizeTime(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        if (preg_match('/^\d{2}:\d{2}$/', $value) === 1) {
            return $value.':00';
        }

        return $value;
    }
}
