<?php

namespace App\Modules\Reviews\Repositories;

use App\Models\Product;
use App\Models\Review;
use App\Models\Service;
use App\Modules\Reviews\Contracts\ReviewRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class EloquentReviewRepository implements ReviewRepositoryInterface
{
    public function find(int $id): ?Review
    {
        return Review::query()->find($id);
    }

    public function create(array $data): Review
    {
        return Review::query()->create($data);
    }

    public function update(Review $review, array $data): Review
    {
        $review->fill($data)->save();

        return $review;
    }

    public function existsForProduct(int $userId, int $productId): bool
    {
        return Review::query()
            ->where('user_id', $userId)
            ->where('product_id', $productId)
            ->exists();
    }

    public function existsForService(int $userId, int $serviceId): bool
    {
        return Review::query()
            ->where('user_id', $userId)
            ->where('service_id', $serviceId)
            ->exists();
    }

    public function listForProduct(Product $product, int $perPage): LengthAwarePaginator
    {
        return Review::query()
            ->with('user:id,name')
            ->select(['id', 'user_id', 'product_id', 'rating', 'comment', 'verified_source', 'created_at'])
            ->where('product_id', $product->id)
            ->where('is_published', true)
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    public function listForService(Service $service, int $perPage): LengthAwarePaginator
    {
        return Review::query()
            ->with('user:id,name')
            ->select(['id', 'user_id', 'service_id', 'rating', 'comment', 'verified_source', 'created_at'])
            ->where('service_id', $service->id)
            ->where('is_published', true)
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    public function listAllForAdmin(array $filters = []): LengthAwarePaginator
    {
        return Review::query()
            ->with(['user:id,name', 'product:id,name', 'service:id,name'])
            ->when(
                ! empty($filters['product_id']),
                fn ($query) => $query->where('product_id', $filters['product_id'])
            )
            ->when(
                ! empty($filters['service_id']),
                fn ($query) => $query->where('service_id', $filters['service_id'])
            )
            ->when(
                ! empty($filters['rating']),
                fn ($query) => $query->where('rating', $filters['rating'])
            )
            ->when(
                ($filters['status'] ?? null) === 'published',
                fn ($query) => $query->where('is_published', true)
            )
            ->when(
                ($filters['status'] ?? null) === 'unpublished',
                fn ($query) => $query->where('is_published', false)
            )
            ->orderByDesc('created_at')
            ->paginate((int) ($filters['per_page'] ?? 15));
    }
}
