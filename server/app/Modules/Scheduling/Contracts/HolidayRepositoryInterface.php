<?php

namespace App\Modules\Scheduling\Contracts;

use Illuminate\Support\Carbon;

interface HolidayRepositoryInterface
{
    /**
     * Whether the given calendar date is a closed-for-business holiday.
     * (The UNIQUE index on holidays.date is this lookup's index.)
     */
    public function existsOnDate(Carbon $date): bool;
}
