<?php

namespace App\Modules\Scheduling\Support;

final class BookingIssueTypes
{
    public const HARDWARE = 'hardware';

    public const SOFTWARE = 'software';

    public const NETWORK = 'network';

    public const OTHER = 'other';

    /** @return list<string> */
    public static function all(): array
    {
        return [self::HARDWARE, self::SOFTWARE, self::NETWORK, self::OTHER];
    }
}
