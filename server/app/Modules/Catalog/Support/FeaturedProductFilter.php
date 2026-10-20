<?php

namespace App\Modules\Catalog\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * The public/admin `?featured=` list filter (BE2).
 *
 * Shared by the storefront and admin product listings so the two can never
 * drift in how they parse or validate the flag (rules.md §3 DRY).
 *
 * On parsing: query strings arrive as strings, and Laravel's `boolean` rule
 * accepts only [true, false, 0, 1, '0', '1'] — so the string "true" would be
 * rejected outright. Rather than invent a narrower or wider ad-hoc parser, the
 * value is normalised first with filter_var(FILTER_VALIDATE_BOOLEAN), which is
 * this codebase's own boolean-parsing idiom (SettingService.php uses the same
 * constant to coerce stored settings). That accepts 1/true/on/yes and
 * 0/false/off/no.
 *
 * On invalid input: FILTER_NULL_ON_FAILURE turns junk into null, which then
 * fails the `boolean` rule and produces an ordinary Laravel 422 with a
 * `featured` field error. This matters more than it looks — the alternative
 * (dropping an unparseable value) would silently return the UNFILTERED list,
 * so a client asking for "featured only" would receive everything and never
 * know. A loud 422 is the safe failure mode.
 *
 * On an empty value: `?featured=` is treated as absent, i.e. no filtering.
 * Interpreting it as `false` would mean a client that forgot to interpolate a
 * value silently switches from "featured only" to "everything except featured" —
 * the opposite of what was intended.
 */
final class FeaturedProductFilter
{
    public const QUERY_KEY = 'featured';

    /**
     * Validate rules for the query parameter, in the project's existing style
     * (`sometimes|boolean`, as on Store/UpdateProductRequest's is_published).
     *
     * @return array<string, list<mixed>>
     */
    public static function rules(): array
    {
        return [
            self::QUERY_KEY => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Read and validate `?featured=`, returning the boolean to filter on.
     *
     * Returns null for "do not filter at all" — which covers both an absent
     * parameter and an empty `?featured=`.
     *
     * The normalised value is RETURNED rather than written back onto the
     * request with `$request->merge()`. That is deliberate: merge() targets
     * `Request::getInputSource()`, which is the JSON bag rather than the query
     * bag whenever `isJson()` is true — and it is true for any client that
     * sends `Content-Type: application/json`, which is every real API caller
     * and also Laravel's own `getJson()` test helper. Merging therefore
     * silently failed to overwrite the raw query value for exactly the clients
     * that matter. Returning the value sidesteps input-source ambiguity
     * entirely, and leaves "absent" cleanly distinguishable from "false".
     *
     * @throws ValidationException on an invalid value
     */
    public static function normalize(Request $request): ?bool
    {
        if (! $request->query->has(self::QUERY_KEY)) {
            return null;
        }

        $raw = $request->query(self::QUERY_KEY);

        // `?featured=` with nothing after it means "no filter". Treating it as
        // false would mean a client that forgot to interpolate a value
        // silently flips from "featured only" to "everything except featured".
        if ($raw === '' || $raw === null) {
            return null;
        }

        // An array (?featured[]=1) is never a boolean. filter_var() would
        // quietly coerce it, so it is pushed down the validation path instead
        // and reported as an ordinary field error.
        $candidate = is_array($raw) ? 'not-a-boolean' : $raw;

        $normalized = filter_var($candidate, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        // Validated with the project's usual rule so the 422 body and message
        // are Laravel's standard ones rather than a hand-rolled string.
        $validated = Validator::make(
            [self::QUERY_KEY => $normalized],
            self::rules(),
        )->validate();

        return (bool) $validated[self::QUERY_KEY];
    }
}
