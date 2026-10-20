<?php

namespace App\Modules\Merchandising\Support;

/**
 * Shared validation rules for the optional banner overlay text (BE1).
 *
 * Extracted to one place because StoreBannerRequest and UpdateBannerRequest
 * must agree exactly: if the create rules and update rules ever differ, a field
 * could be accepted on one endpoint and rejected on the other (rules.md §3 DRY,
 * §14 copy-paste anti-pattern).
 *
 * On trimming and empty strings: both are already handled by Laravel's global
 * middleware stack — `TrimStrings` then `ConvertEmptyStringsToNull`, in that
 * order (Illuminate\Foundation\Configuration\Middleware::getGlobalMiddleware).
 * bootstrap/app.php removes neither. So an empty string and a whitespace-only
 * string both arrive here as null, and `nullable` accepts them. This class
 * therefore does NOT re-implement trimming; doing so would duplicate framework
 * behaviour and risk the two disagreeing.
 *
 * On HTML: React escapes these values on output, so a tag here is not an XSS
 * vector — but tags are still rejected rather than stripped, because stripping
 * would silently store something other than what the admin typed ("<b>Sale
 * </b>" would become "Sale"), which is worse than an explicit error. Rejection
 * also matches rules.md §5 ("invalid input never reaches business logic") and
 * §7 (action-oriented messages), and uses a built-in Laravel rule, so no new
 * sanitising dependency is introduced (rules.md §13).
 *
 * The pattern matches a tag SHAPE — `<` or `</`, an optional letter, anything,
 * then `>` — not merely the characters `<` and `>`. Rejecting every `<` would
 * break legitimate banner copy such as "Save <50% today" or "Only 3 left < hurry",
 * which is a real thing an admin writes. Both of those pass, and both are
 * covered by tests.
 */
final class BannerOverlayTextRules
{
    /**
     * Matches an HTML tag: opening (`<b`), closing (`</b`), or spaced-out
     * (`< b >`) forms. `[^>]*` allows attributes, so `<img src=x onerror=y>`
     * is caught. Requires a letter right after `<`/`</`, so `<50%` is not a tag.
     */
    public const HTML_TAG_PATTERN = '/<\s*\/?\s*[a-zA-Z][^>]*>/';

    public const HEADLINE_MAX = 120;

    public const SUBTITLE_MAX = 255;

    /**
     * @return list<mixed>
     */
    public static function headline(): array
    {
        return self::text(self::HEADLINE_MAX);
    }

    /**
     * @return list<mixed>
     */
    public static function subtitle(): array
    {
        return self::text(self::SUBTITLE_MAX);
    }

    /**
     * @return list<mixed>
     */
    private static function text(int $max): array
    {
        return [
            'sometimes',
            'nullable',
            'string',
            "max:{$max}",
            'not_regex:'.self::HTML_TAG_PATTERN,
        ];
    }
}
