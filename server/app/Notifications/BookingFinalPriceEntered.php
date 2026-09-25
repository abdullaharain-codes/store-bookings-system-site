<?php

namespace App\Notifications;

use App\Models\BusinessSetting;
use App\Models\ServiceBooking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Booking final-price notification (release plan Task 11.3).
 *
 * Final-price entry is its own business event (PRD §10): enterFinalPrice()
 * also transitions the booking to 'completed', but the amount is the notable
 * content here — the customer gets exactly ONE notification per business
 * action, never a status-change email for the same action (rules.md §3 SRP).
 * Same design as the other notification classes: fluent MailMessage, website
 * record always, email gated by email_notifications_enabled. ShouldQueue.
 */
class BookingFinalPriceEntered extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly ServiceBooking $booking,
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
        return [
            'booking_id' => $this->booking->id,
            'service_name' => $this->booking->service?->name ?? null,
            'final_price' => $this->booking->final_price,
            'message' => 'The final price for your booking was set to '.$this->booking->final_price.'.',
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your booking final price')
            ->greeting('Hi '.$notifiable->name.',')
            ->line('The final price for your booking has been confirmed at '.$this->booking->final_price.'.')
            ->line('Thank you for choosing our service.');
    }
}
