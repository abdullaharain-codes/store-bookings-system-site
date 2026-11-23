<?php

namespace App\Modules\Scheduling\Repositories;

use App\Models\Holiday;
use App\Modules\Scheduling\Contracts\HolidayRepositoryInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class EloquentHolidayRepository implements HolidayRepositoryInterface
{
    public function existsOnDate(Carbon $date): bool
    {
        // Match by calendar date. The column is DATE and the model casts to
        // date:Y-m-d, but whereDate also handles legacy datetime-formatted
        // values. The table is tiny (blocked dates only), so sargability is
        // not a concern here.
        return Holiday::query()
            ->whereDate('date', $date->toDateString())
            ->exists();
    }

    public function all(): Collection
    {
        return Holiday::query()->orderBy('date')->get();
    }
}
