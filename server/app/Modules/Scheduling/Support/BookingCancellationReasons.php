<?php

namespace App\Modules\Scheduling\Support;

final class BookingCancellationReasons
{
    public const CUSTOMER = 'customer';

    public const RESCHEDULED = 'rescheduled';

    public const ADMIN = 'admin';

    /** @return list<string> */
    public static function all(): array
    {
        return [self::CUSTOMER, self::RESCHEDULED, self::ADMIN];
    }
}
