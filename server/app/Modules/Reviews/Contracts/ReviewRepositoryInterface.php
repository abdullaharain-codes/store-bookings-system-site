<?php

namespace App\Modules\Reviews\Contracts;

use App\Models\Product;
use App\Models\Review;
use App\Models\Service;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface ReviewRepositoryInterface
{
    public function find(int $id): ?Review;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Review;

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Review $review, array $data): Review;

    /**
     * Whether the user already reviewed the given product (one per customer
     * per target, PRD §11 / ReleasePlan §11).
     */
    public function existsForProduct(int $userId, int $productId): bool;

    /**
     * Whether the user already reviewed the given service.
     */
    public function existsForService(int $userId, int $serviceId): bool;

    /**
     * Public read: PUBLISHED reviews of a product, most-recent first,
     * paginated. Eager-loads the reviewer's name so the serialized list is
     * N+1-free (rules.md §10).
     */
    public function listForProduct(Product $product, int $perPage): LengthAwarePaginator;

    /**
     * Public read: PUBLISHED reviews of a service, most-recent first,
     * paginated.
     */
    public function listForService(Service $service, int $perPage): LengthAwarePaginator;

    /**
     * Admin listing — includes unpublished reviews. Supported filters:
     * 'product_id', 'service_id', 'rating' (exact), 'status'
     * ('published'|'unpublished'), 'per_page' (int, default 15).
     */
    public function listAllForAdmin(array $filters = []): LengthAwarePaginator;
}
