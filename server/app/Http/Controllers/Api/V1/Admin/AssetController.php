<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Shared\AuditLogger;
use App\Shared\FileUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssetController extends Controller
{
    public function __construct(
        private readonly FileUploadService $files,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Generic image upload (Phase 12 hardening item #10): creates the Asset
     * that the taxonomy/merch admin CRUD forms then reference as *_asset_id.
     *
     * The endpoint is a thin wrapper over FileUploadService — file type/size/
     * dimension validation, resize, UUID naming and storage all live there and
     * are intentionally NOT duplicated here. The service reports rule failures
     * via InvalidArgumentException; that is mapped to the same {"message": ...}
     * 422 body every DomainValidationException produces (bootstrap/app.php), so
     * a bad file never escapes as a 500.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['required', 'string'],
            'file' => ['required', 'file'],
        ]);

        try {
            $asset = $this->files->store(
                $request->file('file'),
                $validated['category'],
                $request->user()->id,
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->log('Asset', $asset->id, 'uploaded', ['category' => $validated['category']]);

        return response()->json([
            'asset' => [
                'id' => $asset->id,
                'url' => $asset->url,
                'thumbnail_url' => $asset->thumbnail_url,
                'width' => $asset->width,
                'height' => $asset->height,
                'category' => $validated['category'],
            ],
        ], 201);
    }
}
