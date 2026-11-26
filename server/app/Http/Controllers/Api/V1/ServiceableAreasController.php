<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Modules\Scheduling\Services\ServiceableAreaService;
use Illuminate\Http\JsonResponse;

class ServiceableAreasController extends Controller
{
    public function __construct(private readonly ServiceableAreaService $serviceableAreas) {}

    public function show(): JsonResponse
    {
        $cities = $this->serviceableAreas->cities();

        return response()->json([
            'cities' => $cities,
            'restricted' => $cities !== [],
        ]);
    }
}
