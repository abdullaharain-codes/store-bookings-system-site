<?php

namespace App\Modules\Reviews\Services;

use App\Models\Product;
use App\Models\Review;
use App\Models\Service;
use App\Models\User;
use App\Modules\Orders\Services\OrderService;
use App\Modules\Reviews\Contracts\ReviewRepositoryInterface;
use App\Modules\Reviews\Exceptions\ReviewsValidationException;
use App\Modules\Scheduling\Services\BookingService;
use App\Shared\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * Product/Service review business rules (PRD §11 sidebars, ReleasePlan §12).
 *
 * A review is an EARNED write: the reviewer must have a qualifying trigger —
 * a DELIVERED order containing the product, or a COMPLETED booking of the
 * service — and that granting row is recorded on the review (verified_source
 * + source_id) for traceability. A review is created live (is_published true
 * by default): publish state is admin-owned and only ever reached through
 * publish()/unpublish(), the same shape as BannerService.
 *
 * Cross-module reads (a delivered Order, a completed ServiceBooking) go
 * through OrderService and BookingService — never a direct query against
 * another module's tables (architecture.md §3).
 */
class ReviewService
{
    public function __construct(
        private readonly ReviewRepositoryInterface $reviews,
        private readonly OrderService $orders,
        private readonly BookingService $bookings,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Submit a review of a product OR a service (exactly one target).
     *
     * Eligibility (ReleasePlan §12):
     *   - product: the user must have a DELIVERED order containing it
     *   - service: the user must have a COMPLETED booking of it
     *
     * One review per customer per target — enforced at the service layer AND
     * backed by the composite unique indexes on reviews.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws ReviewsValidationException if the target set is not XOR, the
     *                                    user already reviewed the target, or the qualifying purchase
     *                                    does not exist
     */
    public function submitReview(User $user, array $data): Review
    {
        $productId = $data['product_id'] ?? null;
        $serviceId = $data['service_id'] ?? null;

        if (($productId !== null) === ($serviceId !== null)) {
            throw new ReviewsValidationException('A review must target exactly one product or service.');
        }

        $attributes = [
            'user_id' => $user->id,
            'rating' => $data['rating'],
            'comment' => $data['comment'] ?? null,
            // A review is live when written; hiding it is a separate admin
            // action (publish/unpublish) — never a generic-update flag.
            'is_published' => true,
        ];

        if ($productId !== null) {
            $this->assertNotDuplicate($user, productId: (int) $productId);

            $sourceOrderId = $this->orders->findReceivedOrderForProduct($user, (int) $productId);

            if (! $sourceOrderId) {
                throw new ReviewsValidationException('You can only review a product from a delivered order.');
            }

            $attributes['product_id'] = (int) $productId;
            $attributes['verified_source'] = 'order';
            $attributes['source_id'] = $sourceOrderId;
        } else {
            $this->assertNotDuplicate($user, serviceId: (int) $serviceId);

            $sourceBookingId = $this->bookings->findCompletedBookingForService($user, (int) $serviceId);

            if (! $sourceBookingId) {
                throw new ReviewsValidationException('You can only review a service after a completed booking.');
            }

            $attributes['service_id'] = (int) $serviceId;
            $attributes['verified_source'] = 'service_booking';
            $attributes['source_id'] = $sourceBookingId;
        }

        $review = $this->reviews->create($attributes);
        $this->audit->log('Review', $review->id, 'created');

        return $review;
    }

    /**
     * Public read: published reviews of a product, paginated.
     */
    public function listForProduct(Product $product, int $perPage = 15): LengthAwarePaginator
    {
        return $this->reviews->listForProduct($product, $perPage);
    }

    /**
     * Public read: published reviews of a service, paginated.
     */
    public function listForService(Service $service, int $perPage = 15): LengthAwarePaginator
    {
        return $this->reviews->listForService($service, $perPage);
    }

    /**
     * Admin listing — includes unpublished reviews; optionally filterable by
     * target/rating/status.
     */
    public function listAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return $this->reviews->listAllForAdmin($filters);
    }

    public function publish(Review $review): Review
    {
        if ($review->is_published) {
            return $review;
        }

        $this->reviews->update($review, ['is_published' => true]);
        $this->audit->log('Review', $review->id, 'published', ['previous' => false]);

        return $review;
    }

    public function unpublish(Review $review): Review
    {
        if (! $review->is_published) {
            return $review;
        }

        $this->reviews->update($review, ['is_published' => false]);
        $this->audit->log('Review', $review->id, 'unpublished', ['previous' => true]);

        return $review;
    }

    /**
     * @throws ReviewsValidationException if the user already reviewed the target
     */
    private function assertNotDuplicate(User $user, ?int $productId = null, ?int $serviceId = null): void
    {
        $duplicate = $productId !== null
            ? $this->reviews->existsForProduct($user->id, $productId)
            : $this->reviews->existsForService($user->id, $serviceId);

        if ($duplicate) {
            throw new ReviewsValidationException(
                $productId !== null
                    ? 'You have already reviewed this product.'
                    : 'You have already reviewed this service.',
            );
        }
    }
}
