<?php

namespace App\Modules\Taxonomy\Services;

use App\Models\Category;
use App\Modules\Taxonomy\Contracts\CategoryRepositoryInterface;
use App\Modules\Taxonomy\Exceptions\CategoryValidationException;
use App\Shared\AuditLogger;
use App\Shared\Concerns\GeneratesUniqueSlugs;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;

class CategoryService
{
    use GeneratesUniqueSlugs;

    public function __construct(
        private readonly CategoryRepositoryInterface $categories,
        private readonly AuditLogger $audit,
    ) {}

    public function createCategory(array $data): Category
    {
        $attributes = [
            'name' => trim($data['name']),
            'description' => $data['description'] ?? null,
            'display_order' => (int) ($data['display_order'] ?? 0),
            'is_published' => (bool) ($data['is_published'] ?? false),
            'logo_asset_id' => isset($data['logo_asset_id']) ? (int) $data['logo_asset_id'] : null,
            'banner_asset_id' => isset($data['banner_asset_id']) ? (int) $data['banner_asset_id'] : null,
            'parent_category_id' => isset($data['parent_category_id']) ? (int) $data['parent_category_id'] : null,
        ];

        $attributes['slug'] = $this->resolveSlug($data['slug'] ?? null, $attributes['name'], excludeId: null);

        $this->assertValidParent($attributes['parent_category_id']);

        $category = $this->categories->create($attributes);

        $this->audit->log('Category', $category->id, 'created');

        return $category;
    }

    public function updateCategory(Category $category, array $data): Category
    {
        $updates = [];

        if (array_key_exists('name', $data)) {
            $updates['name'] = trim($data['name']);
        }

        foreach (['description', 'display_order', 'logo_asset_id', 'banner_asset_id'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[$field] = $data[$field];
            }
        }

        // Publication state changes must go through publish()/unpublish() so
        // every transition is audit-logged; silently accepting is_published
        // here would bypass the audit trail.
        unset($data['is_published']);

        if (array_key_exists('slug', $data) || array_key_exists('name', $data)) {
            $updates['slug'] = $this->resolveSlug(
                $data['slug'] ?? null,
                $updates['name'] ?? $category->name,
                excludeId: $category->id,
            );
        }

        if (array_key_exists('parent_category_id', $data)) {
            $newParentId = $this->normalizeParentId($data['parent_category_id']);

            if ($newParentId !== $this->normalizeParentId($category->parent_category_id)) {
                $this->assertValidParentChange($category, $newParentId);
                $updates['parent_category_id'] = $newParentId;
            }
        }

        if ($updates !== []) {
            $this->categories->update($category, $updates);

            $this->audit->log('Category', $category->id, 'updated');
        }

        return $category;
    }

    public function publish(Category $category): Category
    {
        if ($category->is_published) {
            return $category;
        }

        $this->categories->update($category, ['is_published' => true]);

        $this->audit->log('Category', $category->id, 'published', ['previous' => false]);

        return $category;
    }

    public function unpublish(Category $category): Category
    {
        if (! $category->is_published) {
            return $category;
        }

        $this->categories->update($category, ['is_published' => false]);

        $this->audit->log('Category', $category->id, 'unpublished', ['previous' => true]);

        return $category;
    }

    public function deleteCategory(Category $category): void
    {
        // Audit before deleting so the referenced entity row still exists and
        // the log entry remains meaningful.
        $this->audit->log('Category', $category->id, 'deleted');

        $this->categories->delete($category);
    }

    /**
     * Cross-module read access for other services (e.g., Catalog validating
     * category assignments) — keeps them out of Taxonomy's tables directly
     * (architecture.md §3: cross-module calls go through service interfaces).
     */
    public function findCategory(int $categoryId): ?Category
    {
        return $this->categories->find($categoryId);
    }

    /**
     * Batch variant of findCategory() — single query, no per-ID loop
     * (rules.md §10 N+1 avoidance).
     *
     * @param  list<int>  $categoryIds
     * @return Collection<int, Category>
     */
    public function findCategoriesByIds(array $categoryIds): Collection
    {
        if ($categoryIds === []) {
            return new Collection;
        }

        return $this->categories->findByIds($categoryIds);
    }

    /**
     * IDs whose products belong to this category's scope: the category itself
     * plus all descendants (subcategory pages narrow, parent pages widen).
     * Single reusable method per architecture.md §4 — never duplicated.
     *
     * @return list<int>
     */
    public function getProductScope(int $categoryId): array
    {
        return $this->categories->getDescendantIds($categoryId);
    }

    /**
     * Explicitly provided slugs are normalized then enforced strictly: an
     * admin-chosen slug that collides is a validation error, not something we
     * silently rename. Auto-generated slugs get -2/-3 suffixing instead.
     */
    private function resolveSlug(?string $providedSlug, string $name, ?int $excludeId): string
    {
        if ($providedSlug !== null && trim($providedSlug) !== '') {
            $slug = Str::slug($providedSlug);

            if ($this->categories->slugExists($slug, $excludeId)) {
                throw new CategoryValidationException("The slug \"{$slug}\" is already in use by another category.");
            }

            return $slug;
        }

        return $this->uniqueSlug(
            Str::slug($name),
            fn (string $candidate): bool => $this->categories->slugExists($candidate, $excludeId),
        );
    }

    private function assertValidParent(?int $parentId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = $this->categories->find($parentId);

        if (! $parent) {
            throw new CategoryValidationException('The selected parent category does not exist.');
        }

        if ($parent->parent_category_id !== null) {
            throw new CategoryValidationException('A subcategory cannot contain further subcategories. Maximum depth is 2 levels.');
        }
    }

    private function assertValidParentChange(Category $category, ?int $newParentId): void
    {
        if ($newParentId === null) {
            return;
        }

        $parent = $this->categories->find($newParentId);

        if (! $parent) {
            throw new CategoryValidationException('The selected parent category does not exist.');
        }

        if ($parent->parent_category_id !== null) {
            throw new CategoryValidationException('A subcategory cannot contain further subcategories. Maximum depth is 2 levels.');
        }

        $descendantIds = $this->categories->getDescendantIds($category->id);

        // getDescendantIds includes the category itself, so this also rejects
        // self-parenting in one check.
        if (in_array($newParentId, $descendantIds, true)) {
            throw new CategoryValidationException('A category cannot be moved under itself or one of its own subcategories.');
        }

        // Moving a category that already has children under another parent
        // would push those children to level 3 — breaks the 2-level invariant.
        if (count($descendantIds) > 1) {
            throw new CategoryValidationException('This category has subcategories and cannot itself become a subcategory.');
        }
    }

    private function normalizeParentId(mixed $value): ?int
    {
        return $value === null || $value === '' ? null : (int) $value;
    }
}
