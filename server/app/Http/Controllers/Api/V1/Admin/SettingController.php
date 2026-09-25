<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BusinessSetting;
use App\Modules\Settings\Http\Requests\UpdateBusinessSettingRequest;
use App\Modules\Settings\Services\SettingService;
use Illuminate\Http\JsonResponse;

class SettingController extends Controller
{
    public function __construct(
        private readonly SettingService $settings,
    ) {}

    /**
     * Full settings list for the admin panel. Non-paginated — the table is a
     * small, enumerable set of key/value/type rows. Values are returned as
     * stored (strings) alongside their type so the admin panel can render the
     * correct input control.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'settings' => $this->settings->list(),
        ]);
    }

    public function show(BusinessSetting $setting): JsonResponse
    {
        return response()->json([
            'setting' => $setting,
        ]);
    }

    public function update(UpdateBusinessSettingRequest $request): JsonResponse
    {
        $setting = $this->settings->update(
            $request->route('setting'),
            $request->validated('value'),
        );

        return response()->json([
            'setting' => $setting->refresh(),
        ]);
    }
}
