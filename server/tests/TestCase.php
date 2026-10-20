<?php

namespace Tests;

use App\Models\BusinessSetting;
use App\Modules\Scheduling\Support\BusinessClock;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // TASK TZ1-fix - start every test with an empty BusinessClock timezone
        // memo. The memo is process-static, so without this a zone resolved by
        // an earlier test would leak into this one (the pin below is a query-
        // builder update, which fires no Eloquent event to clear it).
        BusinessClock::clearMemo();

        // TASK TZ1 - pin the business timezone to UTC for the whole suite.
        //
        // The seed migration sets the real business default (Asia/Karachi), which
        // is what production runs. The pre-existing Scheduling tests were written
        // when "09:00" meant 09:00 UTC: their expectations are correct statements
        // about a UTC business and are not wrong, merely about a different zone.
        // Pinning the setting here keeps them meaningful and untouched instead of
        // rewriting every assertion, while tests that want a real business zone
        // (BusinessTimezoneTest) override it in their own beforeEach, which runs
        // after this.
        //
        // Guarded because pure unit tests never create the schema.
        if (Schema::hasTable('business_settings')) {
            BusinessSetting::where('key', 'business_timezone')->update(['value' => 'UTC']);
        }
    }
}
