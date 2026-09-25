<?php

use App\Models\BusinessSetting;
use App\Models\Role;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Modules\Scheduling\Services\BookingService;
use App\Notifications\BookingFinalPriceEntered;
use App\Notifications\BookingStatusChanged;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
    $this->bookingService = app(BookingService::class);
});

function makeBooking(User $user, string $status = 'pending'): ServiceBooking
{
    return match ($status) {
        'confirmed' => ServiceBooking::factory()->confirmed()->create(['user_id' => $user->id]),
        'technician_on_the_way' => ServiceBooking::factory()->technicianOnTheWay()->create(['user_id' => $user->id]),
        default => ServiceBooking::factory()->create(['user_id' => $user->id]),
    };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

test('transitionStatus dispatches BookingStatusChanged to the booking customer', function () {
    Notification::fake();

    $booking = makeBooking($this->user);

    $this->bookingService->transitionStatus($booking, 'confirmed');

    Notification::assertSentTo($this->user, BookingStatusChanged::class, function ($notification, $channels) use ($booking) {
        return $notification->booking->id === $booking->id
            && $notification->from === 'pending';
    });
});

test('enterFinalPrice dispatches BookingFinalPriceEntered and NOT BookingStatusChanged', function () {
    Notification::fake();

    $booking = makeBooking($this->user, 'technician_on_the_way');

    $this->bookingService->enterFinalPrice($booking, 3500.0);

    Notification::assertSentTo($this->user, BookingFinalPriceEntered::class);
    Notification::assertNotSentTo($this->user, BookingStatusChanged::class);
});

test('both booking notification classes are queued (ShouldQueue), not sent synchronously', function () {
    expect(new BookingStatusChanged(makeBooking($this->user), 'pending'))->toBeInstanceOf(ShouldQueue::class)
        ->and(new BookingFinalPriceEntered(makeBooking($this->user, 'technician_on_the_way')))->toBeInstanceOf(ShouldQueue::class);
});

// ─── Payloads ─────────────────────────────────────────────────────────────────

test('BookingStatusChanged toDatabase payload carries booking id, service name and statuses', function () {
    $service = Service::factory()->create(['name' => 'Laptop Screen Replacement']);
    $booking = makeBooking($this->user);
    $booking->update(['service_id' => $service->id]);

    $notification = new BookingStatusChanged($booking, 'pending');
    $booking->update(['status' => 'confirmed']);

    $payload = $notification->toDatabase($this->user);

    expect($payload['booking_id'])->toBe($booking->id)
        ->and($payload['service_name'])->toBe('Laptop Screen Replacement')
        ->and($payload['from'])->toBe('pending')
        ->and($payload['to'])->toBe('confirmed')
        ->and($payload['message'])->toContain('Confirmed');
});

test('BookingFinalPriceEntered toDatabase payload carries booking id, service name and final price', function () {
    $service = Service::factory()->create(['name' => 'Laptop Screen Replacement']);
    $booking = makeBooking($this->user, 'technician_on_the_way');
    $booking->update([
        'service_id' => $service->id,
        'final_price' => '3500.00',
    ]);

    $notification = new BookingFinalPriceEntered($booking);

    $payload = $notification->toDatabase($this->user);

    expect($payload['booking_id'])->toBe($booking->id)
        ->and($payload['service_name'])->toBe('Laptop Screen Replacement')
        ->and($payload['final_price'])->toBe('3500.00')
        ->and($payload['message'])->toContain('3500.00');
});

// ─── Email gate (email_notifications_enabled) ────────────────────────────────

test('mail channel is included by default for both booking notifications', function () {
    Notification::fake();

    $this->bookingService->transitionStatus(makeBooking($this->user), 'confirmed');
    $this->bookingService->enterFinalPrice(makeBooking($this->user, 'technician_on_the_way'), 3500.0);

    Notification::assertSentTo($this->user, BookingStatusChanged::class, fn ($notification, $channels) => in_array('mail', $channels, true));
    Notification::assertSentTo($this->user, BookingFinalPriceEntered::class, fn ($notification, $channels) => in_array('mail', $channels, true));
});

test('mail channel is suppressed for both booking notifications when email_notifications_enabled is false', function () {
    BusinessSetting::where('key', 'email_notifications_enabled')->update(['value' => '0']);
    Notification::fake();

    $this->bookingService->transitionStatus(makeBooking($this->user), 'confirmed');
    $this->bookingService->enterFinalPrice(makeBooking($this->user, 'technician_on_the_way'), 3500.0);

    Notification::assertSentTo($this->user, BookingStatusChanged::class, fn ($notification, $channels) => $channels === ['database']);
    Notification::assertSentTo($this->user, BookingFinalPriceEntered::class, fn ($notification, $channels) => $channels === ['database']);
});

// ─── Cancellation (Task 11.3a) ───────────────────────────────────────────────

test('cancelBooking dispatches BookingStatusChanged to the booking customer with from and to cancelled', function () {
    Notification::fake();

    $booking = makeBooking($this->user);

    $this->bookingService->cancelBooking($this->user, $booking);

    Notification::assertSentTo($this->user, BookingStatusChanged::class, function ($notification, $channels) use ($booking) {
        return $notification->booking->id === $booking->id
            && $notification->from === 'pending';
    });

    expect($booking->refresh()->status)->toBe('cancelled')
        ->and($booking->cancelled_at)->not->toBeNull();
});

test('cancelBooking mail channel is included by default', function () {
    Notification::fake();

    $this->bookingService->cancelBooking($this->user, makeBooking($this->user));

    Notification::assertSentTo($this->user, BookingStatusChanged::class, fn ($notification, $channels) => in_array('mail', $channels, true));
});

test('cancelBooking mail channel is suppressed when email_notifications_enabled is false', function () {
    BusinessSetting::where('key', 'email_notifications_enabled')->update(['value' => '0']);
    Notification::fake();

    $this->bookingService->cancelBooking($this->user, makeBooking($this->user));

    Notification::assertSentTo($this->user, BookingStatusChanged::class, fn ($notification, $channels) => $channels === ['database']);
});

// ─── Failure isolation (SRS §6.4) ────────────────────────────────────────────

test('a booking status notification failure is swallowed and never fails the committed status change', function () {
    Log::spy();

    $this->app->instance(Dispatcher::class, new class implements Dispatcher
    {
        public function send($notifiables, $notification)
        {
            throw new RuntimeException('send failed');
        }

        public function sendNow($notifiables, $notification, $channels = null)
        {
            throw new RuntimeException('send failed');
        }
    });

    $booking = makeBooking($this->user);

    $this->bookingService->transitionStatus($booking, 'confirmed');

    // The transition committed and the failure did not propagate.
    expect($booking->refresh()->status)->toBe('confirmed');
    $this->assertDatabaseHas('service_bookings', ['id' => $booking->id, 'status' => 'confirmed']);

    // And the failure was logged with the booking id and the exception message.
    Log::shouldHaveReceived('error')->once()->withArgs(function (string $message) use ($booking) {
        return str_contains($message, (string) $booking->id)
            && str_contains($message, 'send failed');
    });
});

test('a booking final-price notification failure is swallowed and never fails the committed completion', function () {
    Log::spy();

    $this->app->instance(Dispatcher::class, new class implements Dispatcher
    {
        public function send($notifiables, $notification)
        {
            throw new RuntimeException('send failed');
        }

        public function sendNow($notifiables, $notification, $channels = null)
        {
            throw new RuntimeException('send failed');
        }
    });

    $booking = makeBooking($this->user, 'technician_on_the_way');

    $this->bookingService->enterFinalPrice($booking, 3500.0);

    // The completion committed and the failure did not propagate.
    expect($booking->refresh()->status)->toBe('completed')
        ->and($booking->final_price)->toBe('3500.00');
    $this->assertDatabaseHas('service_bookings', ['id' => $booking->id, 'status' => 'completed', 'final_price' => '3500.00']);

    // And the failure was logged with the booking id and the exception message.
    Log::shouldHaveReceived('error')->once()->withArgs(function (string $message) use ($booking) {
        return str_contains($message, (string) $booking->id)
            && str_contains($message, 'send failed');
    });
});

test('a cancellation notification failure is swallowed and never fails the committed cancellation', function () {
    Log::spy();

    $this->app->instance(Dispatcher::class, new class implements Dispatcher
    {
        public function send($notifiables, $notification)
        {
            throw new RuntimeException('send failed');
        }

        public function sendNow($notifiables, $notification, $channels = null)
        {
            throw new RuntimeException('send failed');
        }
    });

    $booking = makeBooking($this->user);

    $this->bookingService->cancelBooking($this->user, $booking);

    // The cancellation committed and the failure did not propagate.
    expect($booking->refresh()->status)->toBe('cancelled')
        ->and($booking->cancelled_at)->not->toBeNull();
    $this->assertDatabaseHas('service_bookings', ['id' => $booking->id, 'status' => 'cancelled']);

    // And the failure was logged with the booking id and the exception message.
    Log::shouldHaveReceived('error')->once()->withArgs(function (string $message) use ($booking) {
        return str_contains($message, (string) $booking->id)
            && str_contains($message, 'send failed');
    });
});
