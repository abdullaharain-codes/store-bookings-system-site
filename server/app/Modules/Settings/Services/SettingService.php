<?php

namespace App\Modules\Settings\Services;

use App\Models\BusinessSetting;
use App\Modules\Settings\Contracts\SettingRepositoryInterface;
use App\Shared\AuditLogger;
use Illuminate\Support\Collection;

class SettingService
{
    public function __construct(
        private readonly SettingRepositoryInterface $settings,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * @return Collection<int, BusinessSetting>
     */
    public function list(): Collection
    {
        return $this->settings->all();
    }

    /**
     * Apply a validated value to a setting. The value is canonicalized per
     * the setting's declared type so the BusinessSetting::getValue typed-read
     * helper (architecture.md §4.1) always returns a correct PHP value — in
     * particular booleans are stored as '1'/'0', never the PHP-truthy string
     * 'false'. The change is audit-logged with the pre/post values (the actor
     * is attributed automatically by AuditLogger from the session).
     */
    public function update(BusinessSetting $setting, mixed $value): BusinessSetting
    {
        $oldValue = $setting->value;
        $newValue = $this->canonicalize($setting->type, $value);

        $setting->update([
            'value' => $newValue,
            'updated_by' => auth()->id(),
        ]);

        $this->auditLogger->log('BusinessSetting', $setting->id, 'updated', [
            'key' => $setting->key,
            'type' => $setting->type,
            'before' => $oldValue,
            'after' => $newValue,
        ]);

        return $setting;
    }

    private function canonicalize(string $type, mixed $value): string
    {
        return match ($type) {
            'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            'integer' => (string) (int) $value,
            'json' => is_array($value) || is_object($value)
                ? (string) json_encode($value, JSON_UNESCAPED_UNICODE)
                : (string) $value,
            default => (string) $value,
        };
    }
}
