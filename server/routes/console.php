<?php

use App\Console\Commands\ReleaseExpiredStockHolds;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Housekeeping: release expired stock holds every minute. The system is
// CORRECT even if this cron never fires — availableStock() filters out
// expired holds at query time. This just keeps the table tidy.
Schedule::command(ReleaseExpiredStockHolds::class)->everyMinute();

// Database queue driver + cron-only Hostinger hosting (no persistent worker): drain pending jobs every minute.
Schedule::command('queue:work --stop-when-empty')->everyMinute()->withoutOverlapping();
