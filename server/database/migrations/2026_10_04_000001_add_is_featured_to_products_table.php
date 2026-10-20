<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TASK BE2 (2026-10-04) — products.is_featured.
 *
 * Additive merchandising flag, approved by the product owner 2026-10-03: an
 * admin marks a product as "featured" in the admin panel, and the storefront
 * Home page requests only featured products (that consumer is task B2c).
 *
 * Additive only — one new column, no existing column altered, no route added.
 * `down()` drops exactly what `up()` added, so this is reversible on both MySQL
 * (production) and SQLite (server/phpunit.xml pins
 * DB_CONNECTION=sqlite / DB_DATABASE=":memory:").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            /**
             * NOT NULL, default false — deliberately NOT nullable.
             *
             * This is the opposite of the BE1 banner overlay decision, and the
             * difference is the point. `headline`/`subtitle` are nullable because
             * null is a meaningful third state ("image only"). `is_featured` is
             * a plain boolean flag, where every product is either featured or
             * not: there is no "unknown" to represent, so a NULL would only ever
             * be a bug or an oversight. default false also makes the column safe
             * for existing rows — the migration backfills every current product
             * to not-featured without a data migration, and without a nullable
             * window in which a product could be neither.
             *
             * rules.md §6 ("no nullable field without a documented reason") is
             * satisfied by not being nullable in the first place.
             */
            $table->boolean('is_featured')->default(false)->after('is_published');

            /**
             * Composite index on (is_published, is_featured).
             *
             * A single-column index on is_featured alone was rejected. The one
             * query that matters is the storefront "published AND featured"
             * selection, and `findPublished()` always appends
             * `where('is_published', true)` on top of the shared filter builder.
             * So the flag is never queried alone publicly — a lone
             * `is_featured` index would be chosen by the optimizer and would
             * then still have to fetch every featured row to discard the
             * unpublished ones. One composite index resolves both equality
             * predicates from a single index seek.
             *
             * A composite (is_published, is_featured) also *subsumes* the
             * pre-existing single-column `is_published` index by the
             * leftmost-prefix rule: `WHERE is_published = 1` is still fully
             * served by it. The existing index is deliberately left in place
             * rather than dropped — this migration is additive, and dropping a
             * live index (even a redundant one) is not something to do as a
             * side effect of adding a column. Verified by the
             * `products_is_published_is_featured_index` assertion in the BE2
             * test suite.
             *
             * Composite indexing is not a foreign pattern here:
             * architecture.md §6 already specifies a composite index for
             * ServiceBooking(scheduledSlotStart, scheduledSlotEnd).
             */
            $table->index(['is_published', 'is_featured']);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['is_published', 'is_featured']);
            $table->dropColumn('is_featured');
        });
    }
};
