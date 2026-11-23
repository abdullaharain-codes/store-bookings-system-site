<?php

namespace App\Modules\Scheduling\Contracts;

use App\Models\BusinessHour;
use Illuminate\Support\Collection;

interface BusinessHourRepositoryInterface
{
    /**
     * The single BusinessHour row for a weekday, or null when the shop has no
     * opening-hours entry for that day at all (which is treated as closed).
     *
     * @param  int  $dayOfWeek  0 = Sunday ... 6 = Saturday (Carbon->dayOfWeek)
     */
    public function findByDayOfWeek(int $dayOfWeek): ?BusinessHour;

    /**
     * @return Collection<int, BusinessHour>
     */
    public function all(): Collection;
}
