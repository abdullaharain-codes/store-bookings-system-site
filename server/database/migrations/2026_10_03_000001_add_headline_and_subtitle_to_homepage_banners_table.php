<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TASK BE1 (2026-10-03) — optional overlay text on homepage banners.
 *
 * Product-owner decision: a banner may carry a headline and a subtitle, both
 * edited in the admin panel. This makes design.md §3.7's already-specified
 * "optional overlay text/CTA" actually authorable; PRD §8 previously described
 * only the image + target category + ordering.
 *
 * Additive only: two new nullable columns, no change to any existing column,
 * no change to any route. `down()` removes exactly these two columns, so the
 * migration is fully reversible on both MySQL (production) and SQLite
 * (server/phpunit.xml pins DB_CONNECTION=sqlite / DB_DATABASE=":memory:").
 *
 * rules.md §6 — "no nullable field without a documented reason":
 *
 *   headline / subtitle are NULLABLE because null is a meaningful, authorable
 *   state, not missing data: **null means "this banner shows its image only",
 *   with no text overlay.** Many banners are purely visual, and design.md §3.7
 *   marks the overlay text itself as optional. Making the columns NOT NULL with
 *   a '' default would instead force every image-only banner to carry a
 *   meaningless empty string, and would make "no overlay" indistinguishable
 *   from "an overlay whose text happens to be blank".
 *
 *   Both are therefore nullable, default to NULL, and the admin API treats an
 *   empty string as "clear it" (null) rather than as an empty overlay.
 *
 * Lengths (120 / 255) are enforced at the API boundary by
 * StoreBannerRequest/UpdateBannerRequest, and the column widths mirror them so
 * the database cannot store a value the API would have rejected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('homepage_banners', function (Blueprint $table) {
            // Optional overlay headline. See the class docblock for why null is
            // required (null = image-only banner).
            $table->string('headline', 120)->nullable()->after('is_published');

            // Optional overlay subtitle, supporting the headline.
            $table->string('subtitle', 255)->nullable()->after('headline');
        });
    }

    public function down(): void
    {
        Schema::table('homepage_banners', function (Blueprint $table) {
            $table->dropColumn(['headline', 'subtitle']);
        });
    }
};
