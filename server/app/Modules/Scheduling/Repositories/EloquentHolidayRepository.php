<?php

namespace App\Modules\Scheduling\Repositories;

use App\Models\Holiday;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use Illuminate\Support\Carbon;

class EloquentHolidayRepository implements HolidayRepositoryInterface
{
    public function existsOnDate(Carbon $date): bool
    {
        // The 'date' cast persists as 'Y-m-d H:i:s' (Eloquent writes datetimes
        // even for date-only columns), so match the whole day as a range
        // instead of an exact string — and stay sargable on the unique index.
        return Holiday::query()
            ->whereBetween('date', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
            ->exists();
    }
}
