<?php

namespace App\Notifications;

use App\Models\BusinessSetting;
use App\Models\ServiceBooking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class BookingRescheduled extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly ServiceBooking $booking,
        public readonly int $oldBookingId,
        public readonly bool $isAdmin = false,
        public readonly ?string $reason = null,
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
        $newTime = $this->booking->scheduled_slot_start?->toDateTimeString();
        $message = 'Your booking has been rescheduled to '.$newTime.'.';
        if ($this->isAdmin && $this->reason) {
            $message .= ' Reason: '.$this->reason;
        }

        return [
            'booking_id' => $this->booking->id,
            'old_booking_id' => $this->oldBookingId,
            'service_name' => $this->booking->service?->name ?? null,
            'scheduled_slot_start' => $this->booking->scheduled_slot_start?->toIso8601String(),
            'scheduled_slot_end' => $this->booking->scheduled_slot_end?->toIso8601String(),
            'reason' => $this->reason,
            'message' => $message,
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $newTime = $this->booking->scheduled_slot_start?->toDateTimeString();
        $mail = (new MailMessage)
            ->subject('Your booking has been rescheduled')
            ->greeting('Hi '.$notifiable->name.',')
            ->line('Your booking has been rescheduled to '.$newTime.'.');

        if ($this->isAdmin && $this->reason) {
            $mail->line('Reason: '.$this->reason);
        }

        return $mail->line('Thank you for choosing our service.');
    }
}
