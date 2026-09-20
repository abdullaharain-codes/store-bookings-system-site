<?php

use App\Modules\Services\Contracts\ServiceRepositoryInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->repository = app(ServiceRepositoryInterface::class);
});

// ─── Published-only listing ──────────────────────────────────────────────────

test('findPublished returns only published services', function () {
    $this->repository->create([
        'name' => 'Hidden Repairs',
        'slug' => 'hidden-repairs',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
        'is_published' => false,
    ]);

    $this->repository->create([
        'name' => 'Public Repairs',
        'slug' => 'public-repairs',
        'price_min' => 1000,
        'price_max' => 2000,
        'duration_minutes' => 60,
        'is_published' => true,
    ]);

    $published = $this->repository->findPublished(15);

    expect($published->total())->toBe(1);
    expect($published->first()->slug)->toBe('public-repairs');
});

test('findPublished orders by name and paginates', function () {
    $names = ['Zeta Service', 'Alpha Service', 'Mike Service'];
    foreach ($names as $name) {
        $this->repository->create([
            'name' => $name,
            'slug' => strtolower(str_replace(' ', '-', $name)),
            'price_min' => 1000,
            'price_max' => 2000,
            'duration_minutes' => 60,
            'is_published' => true,
        ]);
    }

    $page = $this->repository->findPublished(2);

    expect($page->perPage())->toBe(2);
    expect($page->pluck('name')->all())->toBe(['Alpha Service', 'Mike Service']);
    expect($this->repository->findPublished(2)->lastPage())->toBe(2);
});

// ─── Admin listing filters ───────────────────────────────────────────────────

test('findAllForAdmin filters by search, status and per_page', function () {
    $this->repository->create([
        'name' => 'Virus Removal',
        'slug' => 'virus-removal',
        'price_min' => 500,
        'price_max' => 1500,
        'duration_minutes' => 30,
        'is_published' => true,
    ]);
    $this->repository->create([
        'name' => 'Data Recovery',
        'slug' => 'data-recovery',
        'price_min' => 3000,
        'price_max' => 9000,
        'duration_minutes' => 120,
        'is_published' => true,
    ]);
    $this->repository->create([
        'name' => 'Old Cleaning',
        'slug' => 'old-cleaning',
        'price_min' => 1000,
        'price_max' => 2500,
        'duration_minutes' => 60,
        'is_published' => false,
    ]);

    $search = $this->repository->findAllForAdmin(['search' => 'removal']);
    expect($search->total())->toBe(1);
    expect($search->first()->name)->toBe('Virus Removal');

    $published = $this->repository->findAllForAdmin(['status' => 'published']);
    expect($published->total())->toBe(2);

    $unpublished = $this->repository->findAllForAdmin(['status' => 'unpublished']);
    expect($unpublished->total())->toBe(1);

    $paged = $this->repository->findAllForAdmin(['per_page' => 2]);
    expect($paged->perPage())->toBe(2);
});

// ─── CRUD + slug uniqueness ──────────────────────────────────────────────────

test('slugExists reports collisions and honours the exclusion', function () {
    $service = $this->repository->create([
        'name' => 'Network Setup',
        'slug' => 'network-setup',
        'price_min' => 1500,
        'price_max' => 3000,
        'duration_minutes' => 60,
        'is_published' => true,
    ]);

    expect($this->repository->slugExists('network-setup'))->toBeTrue();
    expect($this->repository->slugExists('network-setup', $service->id))->toBeFalse();
    expect($this->repository->slugExists('unused-slug'))->toBeFalse();
});

test('repository create, find, findBySlug, update and delete round-trip', function () {
    $service = $this->repository->create([
        'name' => 'Printer Repair',
        'slug' => 'printer-repair',
        'description' => 'Ink survey and mechanical fix.',
        'price_min' => 1200,
        'price_max' => 3200,
        'duration_minutes' => 75,
        'is_published' => true,
    ]);

    expect($service->id)->not->toBeNull();
    expect($this->repository->find($service->id)->slug)->toBe('printer-repair');
    expect($this->repository->findBySlug('printer-repair')->id)->toBe($service->id);

    $this->repository->update($service, ['price_max' => 4000]);

    expect((float) $service->refresh()->price_max)->toBe(4000.0);

    $this->repository->delete($service);

    expect($this->repository->find($service->id))->toBeNull();
});
