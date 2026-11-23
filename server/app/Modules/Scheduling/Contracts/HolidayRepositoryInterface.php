<?php

namespace App\Modules\Scheduling\Contracts;

use App\Models\Holiday;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

interface HolidayRepositoryInterface
{
    /**
     * Whether the given calendar date is a closed-for-business holiday.
     * (The UNIQUE index on holidays.date is this lookup's index.)
     */
    public function existsOnDate(Carbon $date): bool;

    /**
     * @return Collection<int, Holiday>
     */
    public function all(): Collection;
}
