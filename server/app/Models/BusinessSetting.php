<?php

namespace App\Models;

use App\Modules\Scheduling\Support\BusinessClock;
use Illuminate\Database\Eloquent\Model;

class BusinessSetting extends Model
{
    protected $fillable = ['key', 'value', 'type', 'updated_by'];

    protected $casts = [
        'value' => 'string',
    ];

    /**
     * Any saved setting invalidates BusinessClock's memoised timezone, so an
     * admin change is re-read (once) on the next request and never served stale.
     */
    protected static function booted(): void
    {
        static::saved(fn () => BusinessClock::clearMemo());
    }

    public static function getValue(string $key, mixed $default = null): mixed
    {
        $setting = static::where('key', $key)->first();

        if (! $setting) {
            return $default;
        }

        return match ($setting->type) {
            'integer' => (int) $setting->value,
            'boolean' => (bool) $setting->value,
            'json' => json_decode($setting->value, true),
            default => $setting->value,
        };
    }
}
