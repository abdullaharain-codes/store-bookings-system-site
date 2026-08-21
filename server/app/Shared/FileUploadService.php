<?php

namespace App\Shared;

use App\Models\Asset;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\ImageManager;
use Intervention\Image\Drivers\Gd\Driver;

class FileUploadService
{
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    private const MAX_SIZES = [
        'default' => 2 * 1024 * 1024,      // 2 MB
        'banner' => 4 * 1024 * 1024,       // 4 MB
    ];

    private const MAX_DIMENSIONS = [
        'logo' => ['width' => 1024, 'height' => 1024],
        'banner' => ['width' => 2400, 'height' => 1200],
        'product' => ['width' => 2000, 'height' => 2000],
    ];

    private const VALID_CATEGORIES = [
        'products',
        'brands',
        'categories',
        'categories/banners',
        'homepage',
        'review-showcase',
        'booking-attachments',
    ];

    private const THUMBNAIL_MAX_WIDTH = 400;
    private const THUMBNAIL_MAX_HEIGHT = 400;

    private ImageManager $imageManager;

    public function __construct()
    {
        $this->imageManager = new ImageManager(new Driver());
    }

    /**
     * Store an uploaded file with a thumbnail variant and create an Asset record.
     */
    public function store(
        UploadedFile $file,
        string $category,
        ?int $uploadedBy = null,
        ?string $altText = null,
        ?string $dimensionPreset = null,
    ): Asset {
        $this->validateCategory($category);
        $this->validateFile($file, $category);
        $this->validateDimensions($file, $dimensionPreset);

        $uuid = (string) \Illuminate\Support\Str::uuid();
        $extension = strtolower($file->getClientOriginalExtension());

        $fullFilename = "{$uuid}.{$extension}";
        $thumbFilename = "{$uuid}-thumb.{$extension}";

        $disk = Storage::disk('uploads');

        $fullPath = $disk->putFileAs($category, $file, $fullFilename);

        $thumbnailPath = $this->createThumbnail($file, $category, $thumbFilename);

        $dimensions = $this->getImageDimensions($file);

        return Asset::create([
            'disk' => 'uploads',
            'path' => $fullPath,
            'thumbnail_path' => $thumbnailPath,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'width' => $dimensions['width'] ?? null,
            'height' => $dimensions['height'] ?? null,
            'alt_text' => $altText,
            'uploaded_by' => $uploadedBy,
        ]);
    }

    /**
     * Delete an asset (record + all physical files).
     */
    public function delete(Asset $asset): bool
    {
        $disk = Storage::disk($asset->disk);

        $disk->delete($asset->path);

        if ($asset->thumbnail_path) {
            $disk->delete($asset->thumbnail_path);
        }

        return $asset->delete();
    }

    private function createThumbnail(UploadedFile $file, string $category, string $thumbFilename): string
    {
        $image = $this->imageManager->decodePath($file->getRealPath());

        $image->scaleDown(self::THUMBNAIL_MAX_WIDTH, self::THUMBNAIL_MAX_HEIGHT);

        $encoded = $image->encodeUsingMediaType($file->getMimeType());

        $tempPath = tempnam(sys_get_temp_dir(), 'thumb_');
        $encoded->save($tempPath);

        $tempFile = new UploadedFile(
            $tempPath,
            $thumbFilename,
            $file->getMimeType(),
            null,
            true
        );

        return Storage::disk('uploads')->putFileAs($category, $tempFile, $thumbFilename);
    }

    private function validateCategory(string $category): void
    {
        if (!in_array($category, self::VALID_CATEGORIES)) {
            throw new \InvalidArgumentException("Invalid upload category: {$category}");
        }
    }

    private function validateFile(UploadedFile $file, string $category): void
    {
        if (!in_array($file->getMimeType(), self::ALLOWED_MIME_TYPES)) {
            throw new \InvalidArgumentException(
                "Invalid file type: {$file->getMimeType()}. Allowed: " . implode(', ', self::ALLOWED_MIME_TYPES)
            );
        }

        $extension = strtolower($file->getClientOriginalExtension());
        if (!in_array($extension, self::ALLOWED_EXTENSIONS)) {
            throw new \InvalidArgumentException(
                "Invalid file extension: {$extension}. Allowed: " . implode(', ', self::ALLOWED_EXTENSIONS)
            );
        }

        $maxSize = str_contains($category, 'banner') ? self::MAX_SIZES['banner'] : self::MAX_SIZES['default'];
        if ($file->getSize() > $maxSize) {
            throw new \InvalidArgumentException(
                "File exceeds maximum size of " . round($maxSize / 1024 / 1024, 1) . " MB"
            );
        }
    }

    private function validateDimensions(UploadedFile $file, ?string $preset): void
    {
        if (!$preset || !isset(self::MAX_DIMENSIONS[$preset])) {
            return;
        }

        $dimensions = getimagesize($file->getRealPath());
        if (!$dimensions) {
            return;
        }

        $max = self::MAX_DIMENSIONS[$preset];
        if ($dimensions[0] > $max['width'] || $dimensions[1] > $max['height']) {
            throw new \InvalidArgumentException(
                "Image dimensions {$dimensions[0]}x{$dimensions[1]} exceed maximum {$max['width']}x{$max['height']} for {$preset}"
            );
        }
    }

    private function getImageDimensions(UploadedFile $file): ?array
    {
        $dimensions = getimagesize($file->getRealPath());

        return $dimensions ? ['width' => $dimensions[0], 'height' => $dimensions[1]] : null;
    }
}
