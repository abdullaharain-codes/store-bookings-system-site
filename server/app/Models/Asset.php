<?php

namespace App\Models;

use Database\Factories\AssetFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Asset extends Model
{
    /** @use HasFactory<AssetFactory> */
    use HasFactory;

    protected $fillable = [
        'uuid',
        'disk',
        'path',
        'thumbnail_path',
        'original_name',
        'mime_type',
        'size',
        'width',
        'height',
        'alt_text',
        'uploaded_by',
    ];

    protected $appends = [
        'url',
        'thumbnail_url',
    ];

    protected static function booted(): void
    {
        static::creating(function (Asset $asset) {
            if (! $asset->uuid) {
                $asset->uuid = (string) Str::uuid();
            }
        });
    }

    public function getUrlAttribute(): string
    {
        $diskUrl = config("filesystems.disks.{$this->disk}.url", '');

        return "{$diskUrl}/{$this->path}";
    }

    public function getThumbnailUrlAttribute(): ?string
    {
        if (! $this->thumbnail_path) {
            return null;
        }

        $diskUrl = config("filesystems.disks.{$this->disk}.url", '');

        return "{$diskUrl}/{$this->thumbnail_path}";
    }
}
