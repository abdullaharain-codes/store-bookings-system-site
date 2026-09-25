<?php

use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use App\Modules\Orders\Services\OrderService;
use App\Notifications\OrderStatusChanged;
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
    $this->orderService = app(OrderService::class);
});

function makeTransitionOrder(User $user): Order
{
    return Order::factory()->create([
        'user_id' => $user->id,
        'status' => 'pending',
    ]);
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

test('transitionStatus dispatches OrderStatusChanged to the order owner', function () {
    Notification::fake();

    $order = makeTransitionOrder($this->user);

    $this->orderService->transitionStatus($order, 'confirmed');

    Notification::assertSentTo($this->user, OrderStatusChanged::class, function ($notification, $channels) use ($order) {
        return $notification->order->id === $order->id
            && $notification->from === 'pending';
    });
});

test('OrderStatusChanged is queued (ShouldQueue), not sent synchronously', function () {
    $notification = new OrderStatusChanged(makeTransitionOrder($this->user), 'pending');

    expect($notification)->toBeInstanceOf(ShouldQueue::class);
});

test('database payload carries order id, from/to statuses and a message', function () {
    $order = makeTransitionOrder($this->user);
    $notification = new OrderStatusChanged($order, 'confirmed');
    $order->update(['status' => 'shipped']);

    $payload = $notification->toDatabase($this->user);

    expect($payload['order_id'])->toBe($order->id)
        ->and($payload['order_number'])->toBe($order->order_number)
        ->and($payload['from'])->toBe('confirmed')
        ->and($payload['to'])->toBe('shipped')
        ->and($payload['message'])->toContain($order->order_number);
});

// ─── Email gate (email_notifications_enabled) ────────────────────────────────

test('mail channel is included by default when email_notifications_enabled is true', function () {
    Notification::fake();

    $order = makeTransitionOrder($this->user);

    $this->orderService->transitionStatus($order, 'confirmed');

    Notification::assertSentTo(
        $this->user,
        OrderStatusChanged::class,
        fn ($notification, $channels) => in_array('mail', $channels, true),
    );
});

test('mail channel is suppressed when email_notifications_enabled is false; website record still kept', function () {
    BusinessSetting::where('key', 'email_notifications_enabled')->update(['value' => '0']);
    Notification::fake();

    $order = makeTransitionOrder($this->user);

    $this->orderService->transitionStatus($order, 'confirmed');

    Notification::assertSentTo(
        $this->user,
        OrderStatusChanged::class,
        fn ($notification, $channels) => $channels === ['database'],
    );
});

// ─── Failure isolation (SRS §6.4) ────────────────────────────────────────────

test('a notification send failure is swallowed and never fails the committed status change', function () {
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

    $order = makeTransitionOrder($this->user);

    $this->orderService->transitionStatus($order, 'confirmed');

    // The transition committed and the failure did not propagate.
    expect($order->refresh()->status)->toBe('confirmed')
        ->and($order->payment_status)->toBe('pending');
    $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'confirmed']);

    // And the failure was logged with the order id and the exception message.
    Log::shouldHaveReceived('error')->once()->withArgs(function (string $message) use ($order) {
        return str_contains($message, (string) $order->id)
            && str_contains($message, 'send failed');
    });
});
