<?php

namespace Database\Factories;

use App\Models\Address;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends Factory<ServiceBooking>
 */
class ServiceBookingFactory extends Factory
{
    /**
     * Default: a pending booking for a future slot — the "just created" state
     * before the booking flow confirms the window.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $startsAt = now()->addHours(5)->startOfHour();

        return [
            'user_id' => User::factory(),
            'service_id' => Service::factory(),
            'technician_id' => null,
            'address_id' => Address::factory(),
            'recipient_name' => fake()->name(),
            'phone' => fake()->numerify('03##-#######'),
            'address_line_1' => fake()->address(),
            'address_line_2' => fake()->optional()->secondaryAddress(),
            'city' => fake()->city(),
            'postal_code' => fake()->optional()->numerify('#####'),
            'map_link' => 'https://maps.app.goo.gl/'.fake()->regexify('[A-Za-z0-9]{10}'),
            'customer_gender' => fake()->randomElement(['male', 'female', 'other']),
            'scheduled_slot_start' => $startsAt,
            'scheduled_slot_end' => $startsAt->copy()->addMinutes(60),
            'status' => 'pending',
            'problem_description' => fake()->sentence(8),
            'issue_type' => fake()->randomElement(['hardware', 'software', 'network', 'other']),
            'device_type' => fake()->randomElement(['laptop', 'desktop', 'printer', 'router', 'other']),
            'brand' => fake()->company(),
            'model' => fake()->optional()->bothify('Model-###'),
            'final_price' => null,
            'cancelled_at' => null,
            'rescheduled_from_id' => null,
        ];
    }

    /**
     * A confirmed booking — the customer's slot is locked in.
     */
    public function confirmed(): static
    {
        return $this->state(['status' => 'confirmed']);
    }

    /**
     * "Technician On The Way" (PRD §9/§10) — an imminent slot that has passed
     * the hard-block point: customer cancellation/reschedule is now impossible.
     */
    public function technicianOnTheWay(): static
    {
        return $this->state(function () {
            $startsAt = now()->addMinutes(15);

            return [
                'scheduled_slot_start' => $startsAt,
                'scheduled_slot_end' => $startsAt->copy()->addMinutes(60),
                'status' => 'technician_on_the_way',
            ];
        });
    }

    /**
     * Completed booking with the final actual price entered by the technician
     * (PRD §10: "technician enters final actual price on completion"). The
     * slot is a recent past window — the visit already happened.
     */
    public function completed(): static
    {
        return $this->state(function () {
            $startsAt = now()->subHours(3)->startOfHour();

            return [
                'scheduled_slot_start' => $startsAt,
                'scheduled_slot_end' => $startsAt->copy()->addMinutes(60),
                'status' => 'completed',
                'final_price' => number_format(fake()->randomFloat(2, 1000, 50000), 2, '.', ''),
            ];
        });
    }

    /**
     * A cancelled booking: future slot (the technician was never dispatched),
     * with the cancellation timestamp set. This is the shape Phase 8's
     * cancellation-cutoff tests will build on.
     */
    public function cancelled(): static
    {
        return $this->state([
            'scheduled_slot_start' => now()->addHours(3)->startOfHour(),
            'cancelled_at' => now()->subHour(),
            'status' => 'cancelled',
        ]);
    }

    /**
     * Pin the exact window (half-open, 'Y-m-d H:i:s' compatible).
     */
    public function window(string $startsAt, string $endsAt): static
    {
        return $this->state([
            'scheduled_slot_start' => Carbon::parse($startsAt),
            'scheduled_slot_end' => Carbon::parse($endsAt),
        ]);
    }
}
