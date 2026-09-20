<?php

use App\Models\AuditLog;
use App\Models\Category;
use App\Models\User;
use App\Modules\Taxonomy\Exceptions\CategoryValidationException;
use App\Modules\Taxonomy\Services\CategoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->service = app(CategoryService::class);
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

// ─── Slug handling ───────────────────────────────────────────────────────────

test('create generates slug automatically from name', function () {
    $category = $this->service->createCategory(['name' => 'Gaming Laptops']);

    expect($category->slug)->toBe('gaming-laptops');
});

test('create appends numeric suffixes on auto-generated slug collision', function () {
    $first = $this->service->createCategory(['name' => 'Monitors']);
    $second = $this->service->createCategory(['name' => 'Monitors']);
    $third = $this->service->createCategory(['name' => 'Monitors']);

    expect($first->slug)->toBe('monitors');
    expect($second->slug)->toBe('monitors-2');
    expect($third->slug)->toBe('monitors-3');
});

test('create throws when an explicitly provided slug is already taken', function () {
    $this->service->createCategory(['name' => 'Taken Name']);

    expect(fn () => $this->service->createCategory([
        'name' => 'Different Name',
        'slug' => 'taken-name',
    ]))->toThrow(CategoryValidationException::class);
});

test('update accepts the category keeping its own slug (excludes self)', function () {
    $category = $this->service->createCategory(['name' => 'Alpha', 'slug' => 'alpha']);
    $this->service->createCategory(['name' => 'Beta']);

    $updated = $this->service->updateCategory($category, ['name' => 'Alpha Renamed', 'slug' => 'alpha']);

    expect($updated->refresh()->slug)->toBe('alpha');
});

// ─── Hierarchy rules (PRD §7.2: maximum 2 levels) ────────────────────────────

test('create rejects a subcategory under a subcategory (2-level limit)', function () {
    $topLevel = $this->service->createCategory(['name' => 'Components']);
    $child = $this->service->createCategory(['name' => 'GPUs', 'parent_category_id' => $topLevel->id]);

    expect($child->parent_category_id)->toBe($topLevel->id);

    expect(fn () => $this->service->createCategory([
        'name' => 'RTX Cards',
        'parent_category_id' => $child->id,
    ]))->toThrow(CategoryValidationException::class);
});

test('create rejects an unknown parent category', function () {
    expect(fn () => $this->service->createCategory([
        'name' => 'Orphan',
        'parent_category_id' => 99999,
    ]))->toThrow(CategoryValidationException::class);
});

test('update rejects moving a category under its own descendant (cycle)', function () {
    $parent = $this->service->createCategory(['name' => 'Parent']);
    $child = $this->service->createCategory(['name' => 'Child', 'parent_category_id' => $parent->id]);

    expect(fn () => $this->service->updateCategory($parent, [
        'parent_category_id' => $child->id,
    ]))->toThrow(CategoryValidationException::class);
});

test('update rejects self-parenting', function () {
    $category = $this->service->createCategory(['name' => 'Selfy']);

    expect(fn () => $this->service->updateCategory($category, [
        'parent_category_id' => $category->id,
    ]))->toThrow(CategoryValidationException::class);
});

test('update rejects making a category that has children into a subcategory', function () {
    $parent = $this->service->createCategory(['name' => 'Parent With Kids']);
    $this->service->createCategory(['name' => 'Kid', 'parent_category_id' => $parent->id]);
    $otherTopLevel = $this->service->createCategory(['name' => 'Other Top Level']);

    expect(fn () => $this->service->updateCategory($parent, [
        'parent_category_id' => $otherTopLevel->id,
    ]))->toThrow(CategoryValidationException::class);
});

test('update allows moving a leaf category under another top-level category', function () {
    $leaf = $this->service->createCategory(['name' => 'Movable Leaf']);
    $target = $this->service->createCategory(['name' => 'New Home']);

    $moved = $this->service->updateCategory($leaf, ['parent_category_id' => $target->id]);

    expect($moved->refresh()->parent_category_id)->toBe($target->id);
});

// ─── Publication + audit trail ───────────────────────────────────────────────

test('publish and unpublish write audit rows with actor and previous state', function () {
    $category = $this->service->createCategory(['name' => 'Audited Cat']);

    $this->service->publish($category);

    $publishedLog = AuditLog::query()
        ->where('entity', 'Category')
        ->where('action', 'published')
        ->firstOrFail();
    expect($publishedLog->entity_id)->toBe($category->id);
    expect($publishedLog->actor_id)->toBe($this->user->id);
    expect($publishedLog->metadata)->toBe(['previous' => false]);

    $this->service->unpublish($category);

    $unpublishedLog = AuditLog::query()
        ->where('entity', 'Category')
        ->where('action', 'unpublished')
        ->firstOrFail();
    expect($unpublishedLog->entity_id)->toBe($category->id);
    expect($unpublishedLog->actor_id)->toBe($this->user->id);
    expect($unpublishedLog->metadata)->toBe(['previous' => true]);
    expect($category->refresh()->is_published)->toBeFalse();
});

test('repeated publish is an idempotent no-op (single audit row)', function () {
    $category = $this->service->createCategory(['name' => 'Once Only']);

    $this->service->publish($category);
    $this->service->publish($category);

    expect(AuditLog::query()->where('action', 'published')->count())->toBe(1);
    expect($category->refresh()->is_published)->toBeTrue();
});

test('delete writes the audit entry before removing the category', function () {
    $category = $this->service->createCategory(['name' => 'Doomed']);

    $this->service->deleteCategory($category);

    $deletedLog = AuditLog::query()
        ->where('entity', 'Category')
        ->where('action', 'deleted')
        ->firstOrFail();
    expect((int) $deletedLog->entity_id)->toBe($category->id);

    expect(Category::query()->find($category->id))->toBeNull();
});

// ─── getProductScope (architecture.md §4 reusable query) ─────────────────────

test('getProductScope for a top-level category includes itself and all subcategories', function () {
    $parent = $this->service->createCategory(['name' => 'Peripherals']);
    $childOne = $this->service->createCategory(['name' => 'Keyboards', 'parent_category_id' => $parent->id]);
    $childTwo = $this->service->createCategory(['name' => 'Mice', 'parent_category_id' => $parent->id]);
    $unrelated = $this->service->createCategory(['name' => 'Unrelated']);

    $scope = $this->service->getProductScope($parent->id);

    expect($scope)->toContain($parent->id, $childOne->id, $childTwo->id);
    expect($scope)->not->toContain($unrelated->id);
    expect(count($scope))->toBe(3);
});

test('getProductScope for a subcategory returns only itself', function () {
    $parent = $this->service->createCategory(['name' => 'Audio']);
    $child = $this->service->createCategory(['name' => 'Headsets', 'parent_category_id' => $parent->id]);

    $scope = $this->service->getProductScope($child->id);

    expect($scope)->toBe([$child->id]);
});

test('getProductScope includes unpublished subcategories (structural scope, not visibility)', function () {
    $parent = $this->service->createCategory(['name' => 'Storage']);
    $hiddenChild = $this->service->createCategory(['name' => 'SSDs', 'parent_category_id' => $parent->id]);
    $this->service->unpublish($hiddenChild);

    $scope = $this->service->getProductScope($parent->id);

    expect($scope)->toBe([$parent->id, $hiddenChild->id]);
});
