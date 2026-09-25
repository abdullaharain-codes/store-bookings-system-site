<?php

namespace App\Modules\Settings\Repositories;

use App\Models\BusinessSetting;
use App\Modules\Settings\Contracts\SettingRepositoryInterface;
use Illuminate\Support\Collection;

class EloquentSettingRepository implements SettingRepositoryInterface
{
    public function all(): Collection
    {
        return BusinessSetting::query()
            ->orderBy('key')
            ->get();
    }
}
