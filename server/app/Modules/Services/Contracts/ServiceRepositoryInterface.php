<?php

namespace App\Modules\Services\Contracts;

use App\Models\Service;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface ServiceRepositoryInterface
{
    public function find(int $id): ?Service;

    public function findBySlug(string $slug): ?Service;

    /**
     * Published services, paginated, ordered by name — the query backing the
     * public services listing endpoint. Unpublished services are never
     * returned here (visibility is a repository concern, not a controller one).
     */
    public function findPublished(int $perPage = 15): LengthAwarePaginator;

    /**
     * Admin listing with optional filters.
     * Supported keys: 'search' (name/slug contains), 'status' ('published'|'unpublished'),
     * 'per_page' (int, default 15).
     */
    public function findAllForAdmin(array $filters = []): LengthAwarePaginator;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Service;

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Service $service, array $data): Service;

    public function delete(Service $service): void;

    public function slugExists(string $slug, ?int $excludeId = null): bool;
}
