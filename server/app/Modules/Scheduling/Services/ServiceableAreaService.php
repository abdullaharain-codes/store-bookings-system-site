<?php

namespace App\Modules\Scheduling\Services;

use App\Models\BusinessSetting;

class ServiceableAreaService
{
    /**
     * @return array<int, string>
     */
    public function cities(): array
    {
        $value = BusinessSetting::getValue('serviceable_cities', []);

        if (! is_array($value)) {
            return [];
        }

        $cities = [];
        foreach ($value as $city) {
            if (! is_string($city)) {
                continue;
            }

            $trimmed = trim($city);
            if ($trimmed === '') {
                continue;
            }

            $cities[] = $trimmed;
        }

        return $cities;
    }

    public function isServiceable(string $city): bool
    {
        $cities = $this->cities();

        if ($cities === []) {
            return true;
        }

        $needle = mb_strtolower(trim($city));

        foreach ($cities as $candidate) {
            if (mb_strtolower($candidate) === $needle) {
                return true;
            }
        }

        return false;
    }
}
