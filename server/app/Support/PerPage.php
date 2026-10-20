<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Shared per_page clamp for the public paginated list endpoints (BE4).
 *
 * 48 is an API cap, not a business/pricing value: it is a structural ceiling
 * so a single request cannot page an unbounded number of rows (rules.md §11
 * UI limits belong on the server). It applies uniformly to /products and
 * /services so the two listings can never drift (rules.md §3 DRY).
 *
 * Out-of-range and unparseable values fall back to the endpoint default
 * rather than erroring: a page size is a usability knob, not a business rule,
 * and a junk value degrading to the sane default is the safe failure mode.
 */
final class PerPage
{
    /** Hard ceiling for any single public list request. */
    public const MAX = 48;

    public static function fromRequest(Request $request, int $default = 15): int
    {
        $perPage = (int) $request->query('per_page', $default);

        if ($perPage < 1) {
            return $default;
        }

        return min($perPage, self::MAX);
    }
}
