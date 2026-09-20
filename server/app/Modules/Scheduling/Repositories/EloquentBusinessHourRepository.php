<?php

namespace App\Modules\Scheduling\Repositories;

use App\Models\BusinessHour;
use App\Modules\Scheduling\Contracts\BusinessHourRepositoryInterface;

class EloquentBusinessHourRepository implements BusinessHourRepositoryInterface
{
    public function findByDayOfWeek(int $dayOfWeek): ?BusinessHour
    {
        return BusinessHour::query()->where('day_of_week', $dayOfWeek)->first();
    }
}
