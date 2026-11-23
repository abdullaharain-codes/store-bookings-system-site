<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Holiday;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use App\Modules\Scheduling\Http\Requests\StoreHolidayRequest;
use App\Modules\Scheduling\Http\Requests\UpdateHolidayRequest;
use App\Shared\AuditLogger;
use Illuminate\Http\JsonResponse;

class HolidayController extends Controller
{
    public function __construct(
        private readonly HolidayRepositoryInterface $holidays,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'holidays' => $this->holidays->all(),
        ]);
    }

    public function show(Holiday $holiday): JsonResponse
    {
        return response()->json([
            'holiday' => $holiday,
        ]);
    }

    public function store(StoreHolidayRequest $request): JsonResponse
    {
        $holiday = Holiday::query()->create($request->validated());

        $this->auditLogger->log('Holiday', $holiday->id, 'created', [
            'date' => $holiday->date?->toDateString(),
        ]);

        return response()->json([
            'holiday' => $holiday->refresh(),
        ], 201);
    }

    public function update(UpdateHolidayRequest $request, Holiday $holiday): JsonResponse
    {
        $holiday->update($request->validated());

        $this->auditLogger->log('Holiday', $holiday->id, 'updated', [
            'date' => $holiday->date?->toDateString(),
        ]);

        return response()->json([
            'holiday' => $holiday->refresh(),
        ]);
    }

    public function destroy(Holiday $holiday): JsonResponse
    {
        $id = $holiday->id;
        $date = $holiday->date?->toDateString();
        $holiday->delete();

        $this->auditLogger->log('Holiday', $id, 'deleted', [
            'date' => $date,
        ]);

        return response()->json([
            'message' => 'Holiday deleted.',
        ]);
    }
}
