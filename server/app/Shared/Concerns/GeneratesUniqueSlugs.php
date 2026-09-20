<?php

namespace App\Shared\Concerns;

/**
 * Single source of truth for collision-safe slug suffixing (rules.md §3 DRY):
 * appends -2, -3, ... until a free slug is found. The $existsCheck closure is
 * supplied by the calling service so the algorithm stays repository-agnostic.
 *
 * Lives in App\Shared because multiple feature modules (Taxonomy, Catalog)
 * use it — modules must not depend on each other's internals.
 */
trait GeneratesUniqueSlugs
{
    /**
     * @param  callable(string, ?int=): bool  $existsCheck  ($candidateSlug, $excludeId)
     */
    private function uniqueSlug(string $baseSlug, callable $existsCheck): string
    {
        if (! $existsCheck($baseSlug)) {
            return $baseSlug;
        }

        $suffix = 2;

        while ($existsCheck("{$baseSlug}-{$suffix}")) {
            $suffix++;
        }

        return "{$baseSlug}-{$suffix}";
    }
}
