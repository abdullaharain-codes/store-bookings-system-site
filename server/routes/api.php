<?php

use App\Http\Controllers\Api\V1\AuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    // ── Public routes (allow-listed per architecture.md §5) ─────────────
    Route::get('/health', fn () => response()->json(['status' => 'ok']));

    // Auth (session-based Sanctum SPA auth — needs full web middleware stack)
    Route::prefix('auth')->middleware(['spa'])->group(function () {
        Route::post('/register', [AuthController::class, 'register'])
            ->middleware('throttle:auth');
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:auth');
        Route::post('/logout', [AuthController::class, 'logout'])
            ->middleware('auth:sanctum');
        Route::get('/user', [AuthController::class, 'user'])
            ->middleware('auth:sanctum');
    });

    // ── Protected routes (require authentication + session) ─────────────
    Route::middleware(['auth:sanctum', 'spa'])->group(function () {
        Route::get('/test/protected', fn () => response()->json([
            'message' => 'You are authenticated.',
            'user' => auth()->user()->load('role'),
        ]));
    });

    // ── Admin routes (require auth + admin role) ────────────────────────
    Route::prefix('admin')
        ->middleware(['auth:sanctum', 'spa', 'admin'])
        ->group(function () {
            //
        });
});
