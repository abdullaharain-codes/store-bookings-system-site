<?php

namespace App\Console\Commands;

use App\Modules\Catalog\Contracts\CartRepositoryInterface;
use Illuminate\Console\Command;

/**
 * Housekeeping command: releases expired stock holds by nulling
 * hold_expires_at on stale cart_items. This command is NOT correctness-
 * critical — availableStock() already filters out expired holds at query
 * time. Its sole purpose is to keep the cart_items table tidy so old rows
 * with non-null hold_expires_at don't accumulate forever.
 *
 * Registered on Laravel's scheduler to run every minute. On Hostinger,
 * a single cron entry `* * * * * cd /path/to/server && php artisan schedule:run`
 * is required for this housekeeping to actually fire — the system remains
 * CORRECT even if the cron never runs; expired holds simply linger in the
 * table until they do.
 */
class ReleaseExpiredStockHolds extends Command
{
    protected $signature = 'stock:release-expired-holds';

    protected $description = 'Release expired cart stock holds (housekeeping only)';

    public function handle(CartRepositoryInterface $cartRepo): int
    {
        $expiredHolds = $cartRepo->findExpiredHolds();

        if ($expiredHolds->isEmpty()) {
            $this->info('No expired holds found.');

            return self::SUCCESS;
        }

        $count = 0;

        foreach ($expiredHolds as $item) {
            $cartRepo->releaseHold($item);
            $count++;
        }

        $this->info("Released {$count} expired hold(s).");

        return self::SUCCESS;
    }
}
