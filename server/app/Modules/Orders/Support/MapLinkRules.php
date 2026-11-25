<?php

namespace App\Modules\Orders\Support;

use Closure;

/**
 * Shared validation rules for address map_link (BE8a-1).
 *
 * TrimStrings and ConvertEmptyStringsToNull run globally before validation,
 * so whitespace-only input arrives as null. This class does not re-implement
 * trimming.
 */
final class MapLinkRules
{
    public const MAX_LENGTH = 500;

    /**
     * @return list<mixed>
     */
    public static function required(): array
    {
        return [
            'required',
            'string',
            'max:'.self::MAX_LENGTH,
            self::allowedMapLink(),
        ];
    }

    /**
     * @return list<mixed>
     */
    public static function sometimes(): array
    {
        return [
            'sometimes',
            'required',
            'string',
            'max:'.self::MAX_LENGTH,
            self::allowedMapLink(),
        ];
    }

    private static function allowedMapLink(): Closure
    {
        return static function (string $attribute, mixed $value, Closure $fail): void {
            if (! is_string($value)) {
                $fail('The map link must be a valid Google Maps URL.');

                return;
            }

            if (str_contains($value, '://') && preg_match('/^[a-z][a-z0-9+.-]*:\/\/[^\/@]+@/i', $value)) {
                $fail('The map link must not include user info.');

                return;
            }

            $parts = parse_url($value);
            if ($parts === false) {
                $fail('The map link must be a valid Google Maps URL.');

                return;
            }

            $scheme = strtolower((string) ($parts['scheme'] ?? ''));
            $host = strtolower((string) ($parts['host'] ?? ''));
            $path = (string) ($parts['path'] ?? '');
            $user = $parts['user'] ?? null;
            $pass = $parts['pass'] ?? null;

            if ($user !== null || $pass !== null) {
                $fail('The map link must not include user info.');

                return;
            }

            if ($scheme !== 'https') {
                $fail('The map link must use https.');

                return;
            }

            $allowed = self::isAllowedHostAndPath($host, $path);
            if (! $allowed) {
                $fail('The map link must be a supported Google Maps URL.');

                return;
            }
        };
    }

    private static function isAllowedHostAndPath(string $host, string $path): bool
    {
        if ($host === 'maps.app.goo.gl') {
            return $path !== '' && $path !== '/';
        }

        if ($host === 'goo.gl') {
            return str_starts_with($path, '/maps');
        }

        if ($host === 'maps.google.com') {
            return str_starts_with($path, '/maps') || $path === '/' || $path === '';
        }

        if ($host === 'google.com' || $host === 'www.google.com') {
            return str_starts_with($path, '/maps');
        }

        return false;
    }
}
