<?php

namespace Database\Factories;

use App\Models\SlotHold;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends Factory<SlotHold>
 */
class SlotHoldFactory extends Factory
{
    /**
     * A plausible default hold: tomorrow's window, still live for hours, no
     * owner yet (held_by_user_id nullable by design).
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $startsAt = now()->addHours(5)->startOfHour();

        return [
            'starts_at' => $startsAt,
            'ends_at' => $startsAt->copy()->addMinutes(60),
            'held_by_user_id' => null,
            'expires_at' => now()->addHours(2),
        ];
    }

    /**
     * Pin a specific half-open window (times as 'Y-m-d H:i:s').
     */
    public function window(string $startsAt, string $endsAt): static
    {
        return $this->state([
            'starts_at' => Carbon::parse($startsAt),
            'ends_at' => Carbon::parse($endsAt),
        ]);
    }

    /**
     * An already-expired hold — must never block a new hold for the same
     * window (the live-availability principle).
     */
    public function expired(): static
    {
        return $this->state([
            'expires_at' => now()->subMinute(),
        ]);
    }

    /**
     * Attribute the hold to a specific user.
     */
    public function heldBy(int $userId): static
    {
        return $this->state([
            'held_by_user_id' => $userId,
        ]);
    }
}
