<?php

namespace App\Modules\Catalog\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Normalises and validates the BE4 public `GET /api/v1/products` filters:
 * `min_price`, `max_price` and `in_stock`.
 *
 * Shares the parsing idiom of FeaturedProductFilter (BE2): query values
 * arrive as strings, are normalised first, then pushed through Laravel's
 * validator so a junk value is an ordinary 422 with a field error instead of
 * a silently unfiltered result (the dangerous failure mode — a client asks
 * for a bounded list and unknowingly receives everything).
 *
 * - min_price/max_price: numeric >= 0, applied inclusively to the selling
 *   `price`. An inverted range (max < min) is a 422 on `max_price`.
 * - in_stock: boolean-like via FILTER_VALIDATE_BOOLEAN (1/true/0/false),
 *   matching what the `featured` parser accepts.
 * - Empty values (`?min_price=`, `?in_stock=`) are treated as absent — no
 *   filtering — for the same reason FeaturedProductFilter does: a client that
 *   forgot to interpolate a value must not silently flip the meaning.
 */
final class ProductListFilters
{
    public const MIN_PRICE_KEY = 'min_price';

    public const MAX_PRICE_KEY = 'max_price';

    public const IN_STOCK_KEY = 'in_stock';

    /**
     * Laravel validation rules in the project's existing style.
     *
     * @return array<string, list<mixed>>
     */
    public static function rules(): array
    {
        return [
            self::MIN_PRICE_KEY => ['sometimes', 'numeric', 'min:0'],
            self::MAX_PRICE_KEY => ['sometimes', 'numeric', 'min:0'],
            self::IN_STOCK_KEY => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Read and validate the three filters, returning only the keys supplied
     * with a meaningful value (absent/empty → not present).
     *
     * @return array<string, float|int|bool>
     *
     * @throws ValidationException on a junk value or an inverted range
     */
    public static function normalize(Request $request): array
    {
        $filters = [];

        foreach ([self::MIN_PRICE_KEY, self::MAX_PRICE_KEY] as $key) {
            if (! $request->query->has($key)) {
                continue;
            }

            $raw = $request->query($key);

            // `?key=` with nothing after it means "no filter".
            if ($raw === '' || $raw === null) {
                continue;
            }

            // An array (?min_price[]=1) is never a number — route it through
            // the validator so it is reported as an ordinary field error.
            $candidate = is_array($raw) ? 'not-a-number' : (string) $raw;

            $validated = Validator::make(
                [$key => $candidate],
                [self::MIN_PRICE_KEY => ['numeric', 'min:0'], self::MAX_PRICE_KEY => ['numeric', 'min:0']],
            )->validate();

            $filters[$key] = (float) $validated[$key];
        }

        if (isset($filters[self::MIN_PRICE_KEY], $filters[self::MAX_PRICE_KEY])
            && $filters[self::MAX_PRICE_KEY] < $filters[self::MIN_PRICE_KEY]) {
            throw ValidationException::withMessages([
                self::MAX_PRICE_KEY => 'max_price must be greater than or equal to min_price.',
            ]);
        }

        if ($request->query->has(self::IN_STOCK_KEY)) {
            $raw = $request->query(self::IN_STOCK_KEY);

            if ($raw !== '' && $raw !== null) {
                // Same normalise-then-validate trick as FeaturedProductFilter:
                // FILTER_NULL_ON_FAILURE turns junk into null, which then
                // fails the `boolean` rule and yields a standard 422.
                $candidate = is_array($raw) ? 'not-a-boolean' : $raw;
                $normalized = filter_var($candidate, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

                $validated = Validator::make(
                    [self::IN_STOCK_KEY => $normalized],
                    [self::IN_STOCK_KEY => ['boolean']],
                )->validate();

                $filters[self::IN_STOCK_KEY] = (bool) $validated[self::IN_STOCK_KEY];
            }
        }

        return $filters;
    }
}
