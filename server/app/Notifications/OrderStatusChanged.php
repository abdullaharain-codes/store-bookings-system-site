<?php

namespace App\Notifications;

use App\Models\BusinessSetting;
use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

/**
 * Order status-change notification (release plan Task 11.2).
 *
 * Implemented with Laravel's fluent MailMessage — no Blade/Markdown template
 * exists in this project (the only view is welcome.blade.php), so the email
 * is built inline. The website record is always written; the email is sent
 * ONLY when the global email_notifications_enabled setting is true. This is
 * the single gating point — no other code duplicates the check (rules.md §3
 * DRY). Queued via ShouldQueue so the trigger request never waits on mail.
 */
class OrderStatusChanged extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  string  $from  the status the order was in before this transition
     *                        (the order's current status is the 'to' status)
     */
    public function __construct(
        public readonly Order $order,
        public readonly string $from,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        $channels = ['database'];

        if (BusinessSetting::getValue('email_notifications_enabled', true)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    /**
     * @return array<string, mixed>
     */
    public function toDatabase(object $notifiable): array
    {
        $to = $this->order->status;

        return [
            'order_id' => $this->order->id,
            'order_number' => $this->order->order_number,
            'from' => $this->from,
            'to' => $to,
            'message' => 'Your order '.$this->order->order_number.' status changed from '
                .Str::headline($this->from).' to '.Str::headline($to).'.',
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $to = $this->order->status;

        return (new MailMessage)
            ->subject('Order '.$this->order->order_number.' status changed to '.Str::headline($to))
            ->greeting('Hi '.$notifiable->name.',')
            ->line('Your order '.$this->order->order_number.' status changed from '
                .Str::headline($this->from).' to '.Str::headline($to).'.')
            ->line('Thank you for shopping with us.');
    }
}
