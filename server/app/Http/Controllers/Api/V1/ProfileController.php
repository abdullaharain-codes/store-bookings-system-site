<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\UpdateProfileRequest;
use App\Modules\Users\Services\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer profile self-service (PRD §5.2). Protected (auth:sanctum), no admin
 * gate, no {id} parameter — the authenticated user always acts on their own
 * record, so there is no ownership-check gap. Mirrors the Address controller
 * shape: thin controller, business rules in the service.
 */
class ProfileController extends Controller
{
    public function __construct(
        private readonly ProfileService $profileService,
    ) {}

    /**
     * GET /profile — the authenticated user's own profile.
     */
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user()->load('role'),
        ]);
    }

    /**
     * PUT/PATCH /profile — update the mutable profile fields.
     */
    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $this->profileService->updateProfile(
            $request->user(),
            $request->validated(),
        );

        return response()->json([
            'user' => $user,
        ]);
    }

    /**
     * POST /profile/password — change password after proving the current one.
     */
    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $this->profileService->changePassword(
            $request->user(),
            $request->validated('current_password'),
            $request->validated('new_password'),
        );

        return response()->json([
            'message' => 'Password changed.',
        ]);
    }
}
