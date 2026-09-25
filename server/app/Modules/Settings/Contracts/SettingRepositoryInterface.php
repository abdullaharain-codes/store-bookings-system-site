<?php

namespace App\Modules\Settings\Contracts;

use App\Models\BusinessSetting;
use Illuminate\Support\Collection;

interface SettingRepositoryInterface
{
    /**
     * Every configured setting, ordered by key.
     *
     * @return Collection<int, BusinessSetting>
     */
    public function all(): Collection;
}
