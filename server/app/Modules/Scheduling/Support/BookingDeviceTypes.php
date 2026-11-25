<?php

namespace App\Modules\Scheduling\Support;

final class BookingDeviceTypes
{
    public const LAPTOP = 'laptop';

    public const DESKTOP = 'desktop';

    public const PRINTER = 'printer';

    public const ROUTER = 'router';

    public const OTHER = 'other';

    /** @return list<string> */
    public static function all(): array
    {
        return [self::LAPTOP, self::DESKTOP, self::PRINTER, self::ROUTER, self::OTHER];
    }
}
