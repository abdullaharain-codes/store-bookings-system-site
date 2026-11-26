<?php

namespace App\Modules\Scheduling\Support;

use Illuminate\Support\Carbon;

final readonly class BookingRequestData
{
    public function __construct(
        public int $serviceId,
        public Carbon $startsAt,
        public Carbon $endsAt,
        public int $addressId,
        public string $issueType,
        public string $deviceType,
        public string $brand,
        public ?string $model,
        public string $problemDescription,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     * @param  array{scheduled_slot_start: Carbon, scheduled_slot_end: Carbon}  $window
     */
    public static function fromValidated(array $validated, array $window): self
    {
        return new self(
            serviceId: (int) $validated['service_id'],
            startsAt: $window['scheduled_slot_start'],
            endsAt: $window['scheduled_slot_end'],
            addressId: (int) $validated['address_id'],
            issueType: (string) $validated['issue_type'],
            deviceType: (string) $validated['device_type'],
            brand: (string) $validated['brand'],
            model: isset($validated['model']) ? (string) $validated['model'] : null,
            problemDescription: (string) $validated['problem_description'],
        );
    }
}
