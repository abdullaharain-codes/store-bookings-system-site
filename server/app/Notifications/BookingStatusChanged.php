<?php

namespace App\Notifications;

use App\Models\BusinessSetting;
use App\Models\ServiceBooking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

/**
 * Booking status-change notification (release plan Task 11.3).
 *
 * Same shape as OrderStatusChanged: fluent MailMessage (no Blade/Markdown
 * template exists in this project), website record always written, email sent
 * ONLY when the global email_notifications_enabled setting is true — the
 * single gating point (rules.md §3 DRY). Queued via ShouldQueue.
 */
class BookingStatusChanged extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  string  $from  the status the booking was in before this
     *                        transition (the booking's current status is the
     *                        'to' status)
     */
    public function __construct(
        public readonly ServiceBooking $booking,
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
        $to = $this->booking->status;

        return [
            'booking_id' => $this->booking->id,
            'service_name' => $this->booking->service?->name ?? null,
            'from' => $this->from,
            'to' => $to,
            'message' => 'Your booking status changed from '.Str::headline($this->from).' to '.Str::headline($to).'.',
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $to = $this->booking->status;

        return (new MailMessage)
            ->subject('Booking status changed to '.Str::headline($to))
            ->greeting('Hi '.$notifiable->name.',')
            ->line('Your booking status changed from '.Str::headline($this->from).' to '.Str::headline($to).'.')
            ->line('Thank you for choosing our service.');
    }
}
