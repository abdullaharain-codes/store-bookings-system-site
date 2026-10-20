<?php

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TASK BE2 (2026-10-04) — products.is_featured.
 *
 * An admin-set merchandising flag. The storefront Home "Featured" section
 * (task B2c, NOT this task) will later ask for only featured products; this
 * task is the backend flag, its admin write path, and the public `featured`
 * filter that B2c will consume.
 *
 * Helper names are prefixed `featuredFlag*` because sibling product test files
 * already declare global helpers and Pest loads every Feature file into one
 * process.
 */
uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->featuredFlagAdmin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
});

function featuredFlagAdminPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Featured Test Product '.uniqid(),
        'sku' => 'SKU-'.strtoupper(substr(md5(uniqid('', true)), 0, 10)),
        'price' => 1999,
    ], $overrides);
}

// ─── 1. Admin create: explicit true, and omitted → false ─────────────────────

test('admin creates a product with is_featured true', function () {
    $response = $this->actingAs($this->featuredFlagAdmin)
        ->postJson('/api/v1/admin/products', featuredFlagAdminPayload(['is_featured' => true]));

    $response->assertStatus(201)
        ->assertJsonPath('product.is_featured', true);

    $this->assertDatabaseHas('products', ['is_featured' => true]);
});

test('admin creates a product with is_featured false explicitly', function () {
    $this->actingAs($this->featuredFlagAdmin)
        ->postJson('/api/v1/admin/products', featuredFlagAdminPayload(['is_featured' => false]))
        ->assertStatus(201)
        ->assertJsonPath('product.is_featured', false);

    expect(Product::query()->latest('id')->first()->is_featured)->toBeFalse();
});

test('is_featured defaults to false when omitted on create', function () {
    $payload = featuredFlagAdminPayload();
    expect($payload)->not->toHaveKey('is_featured');

    $this->actingAs($this->featuredFlagAdmin)
        ->postJson('/api/v1/admin/products', $payload)
        ->assertStatus(201)
        ->assertJsonPath('product.is_featured', false);

    $product = Product::query()->latest('id')->first();
    expect($product->is_featured)->toBeFalse();
});

// ─── 2. Admin update toggles true -> false -> true ───────────────────────────

test('admin update toggles is_featured true then false then true again', function () {
    $product = Product::factory()->create();

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['is_featured' => true])
        ->assertOk()
        ->assertJsonPath('product.is_featured', true);
    expect($product->refresh()->is_featured)->toBeTrue();

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['is_featured' => false])
        ->assertOk()
        ->assertJsonPath('product.is_featured', false);
    expect($product->refresh()->is_featured)->toBeFalse();

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['is_featured' => true])
        ->assertOk()
        ->assertJsonPath('product.is_featured', true);
    expect($product->refresh()->is_featured)->toBeTrue();
});

test('update without is_featured leaves the flag untouched', function () {
    $product = Product::factory()->create(['is_featured' => true]);

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['price' => 4242])
        ->assertOk();

    expect($product->refresh()->is_featured)->toBeTrue()
        ->and($product->price)->toBe('4242.00');
});

test('an update naming is_featured never touches publication state', function () {
    // is_featured is a merchandising flag, NOT publication. Featuring an
    // unpublished product must not publish it.
    $product = Product::factory()->create(['is_published' => false]);

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['is_featured' => true])
        ->assertOk()
        ->assertJsonPath('product.is_featured', true)
        ->assertJsonPath('product.is_published', false);

    expect($product->refresh()->is_published)->toBeFalse();
});

// ─── 3. is_featured must be boolean ──────────────────────────────────────────

test('is_featured rejects a junk value on create with a 422 field error', function () {
    $this->actingAs($this->featuredFlagAdmin)
        ->postJson('/api/v1/admin/products', featuredFlagAdminPayload(['is_featured' => 'maybe']))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['is_featured']);

    expect(Product::query()->count())->toBe(0);
});

test('is_featured rejects a junk value on update with a 422 field error', function () {
    $product = Product::factory()->create(['is_featured' => true]);

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['is_featured' => 'yes-please'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['is_featured']);

    expect($product->refresh()->is_featured)->toBeTrue();
});

test('is_featured rejects null on update because the column is NOT NULL', function () {
    $product = Product::factory()->create(['is_featured' => true]);

    $this->actingAs($this->featuredFlagAdmin)
        ->putJson("/api/v1/admin/products/{$product->id}", ['is_featured' => null])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['is_featured']);
});

// ─── 4. Public featured filter ───────────────────────────────────────────────

test('public featured filter returns only published and featured products', function () {
    $wanted = Product::factory()->published()->featured()->count(2)->create();
    Product::factory()->published()->create(); // published, not featured
    Product::factory()->featured()->create(); // featured, NOT published

    $response = $this->getJson('/api/v1/products?featured=1');

    $response->assertOk();
    expect($response->json('total'))->toBe(2);

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toEqualCanonicalizing($wanted->pluck('id')->all());

    // Every returned row really is published AND featured.
    expect(collect($response->json('data'))->every(
        fn ($p) => $p['is_published'] === true && $p['is_featured'] === true
    ))->toBeTrue();
});

test('public featured filter accepts the string true as well as 1', function () {
    Product::factory()->published()->featured()->create();
    Product::factory()->published()->create();

    expect($this->getJson('/api/v1/products?featured=true')->json('total'))->toBe(1);
});

test('an absent featured filter applies no filtering at all', function () {
    Product::factory()->published()->featured()->count(2)->create();
    Product::factory()->published()->count(3)->create();

    expect($this->getJson('/api/v1/products')->json('total'))->toBe(5);
});

test('public featured filter with 0 returns only non-featured published products', function () {
    // Symmetric boolean: the filter narrows on the value given, so 0 is the
    // explicit inverse of 1 rather than a silent "no filter".
    Product::factory()->published()->create();
    Product::factory()->published()->featured()->count(2)->create();

    $response = $this->getJson('/api/v1/products?featured=0');

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.is_featured'))->toBeFalse();
});

test('an empty featured value is treated as absent rather than as false', function () {
    Product::factory()->published()->create();
    Product::factory()->published()->featured()->create();

    // ?featured= with nothing after it must not silently hide featured items.
    expect($this->getJson('/api/v1/products?featured=')->json('total'))->toBe(2);
});

test('featured filter returns an empty page when nothing is featured', function () {
    Product::factory()->published()->count(2)->create();

    $response = $this->getJson('/api/v1/products?featured=1');

    $response->assertOk();
    expect($response->json('total'))->toBe(0)
        ->and($response->json('data'))->toBe([]);
});

// ─── 5. A featured but unpublished product is never publicly visible ────────

test('a featured but unpublished product never appears publicly, filter or not', function () {
    $live = Product::factory()->published()->featured()->create();
    $draft = Product::factory()->featured()->create(['is_published' => false]);
    Product::factory()->published()->create();

    // Without the filter.
    $unfiltered = $this->getJson('/api/v1/products');
    expect($unfiltered->json('total'))->toBe(2)
        ->and(collect($unfiltered->json('data'))->pluck('id')->all())->not->toContain($draft->id);

    // With the filter.
    $filtered = $this->getJson('/api/v1/products?featured=1');
    expect($filtered->json('total'))->toBe(1)
        ->and($filtered->json('data.0.id'))->toBe($live->id);

    // And it is not reachable by slug either.
    $this->getJson("/api/v1/products/{$draft->slug}")->assertStatus(404);
});

test('unpublishing a featured product removes it from the featured feed', function () {
    $product = Product::factory()->published()->featured()->create();
    expect($this->getJson('/api/v1/products?featured=1')->json('total'))->toBe(1);

    $this->actingAs($this->featuredFlagAdmin)
        ->postJson("/api/v1/admin/products/{$product->id}/unpublish")
        ->assertOk();

    expect($this->getJson('/api/v1/products?featured=1')->json('total'))->toBe(0);
});

test('publishing an already-featured product makes it appear without touching the flag', function () {
    $product = Product::factory()->featured()->create();

    expect($this->getJson('/api/v1/products?featured=1')->json('total'))->toBe(0);

    $this->actingAs($this->featuredFlagAdmin)
        ->postJson("/api/v1/admin/products/{$product->id}/publish")
        ->assertOk()
        ->assertJsonPath('product.is_featured', true);

    expect($this->getJson('/api/v1/products?featured=1')->json('total'))->toBe(1);
});

// ─── 6. Composition with category, brand, search, sort, pagination ───────────

test('featured filter composes with brand_id', function () {
    $dell = Brand::factory()->create(['name' => 'Dell']);
    $hp = Brand::factory()->create(['name' => 'HP']);

    Product::factory()->published()->featured()->forBrand($dell)->create();
    Product::factory()->published()->forBrand($dell)->create();      // right brand, not featured
    Product::factory()->published()->featured()->forBrand($hp)->create(); // featured, wrong brand

    $response = $this->getJson("/api/v1/products?featured=1&brand_id={$dell->id}");

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.brand.name'))->toBe('Dell');
});

test('featured filter composes with category_id including a parent category', function () {
    $parent = Category::factory()->create();
    $child = Category::factory()->create(['parent_category_id' => $parent->id]);

    $inChild = Product::factory()->published()->featured()->create();
    $inChild->categories()->sync([$child->id]);

    $unrelated = Product::factory()->published()->featured()->create();

    $response = $this->getJson("/api/v1/products?featured=1&category_id={$parent->id}");

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.id'))->toBe($inChild->id)
        ->and($unrelated->is_published)->toBeTrue();
});

test('featured filter composes with search', function () {
    Product::factory()->published()->featured()->create(['name' => 'Latitude X1', 'sku' => 'LX1-1']);
    Product::factory()->published()->featured()->create(['name' => 'EliteBook', 'sku' => 'ELT-9']);

    expect($this->getJson('/api/v1/products?featured=1&search=ELT')->json('total'))->toBe(1)
        ->and($this->getJson('/api/v1/products?featured=1&search=LAT')->json('total'))->toBe(1)
        ->and($this->getJson('/api/v1/products?featured=1&search=ZZZ')->json('total'))->toBe(0);
});

test('featured filter composes with sort', function () {
    Product::factory()->published()->featured()->create(['price' => 900]);
    Product::factory()->published()->featured()->create(['price' => 100]);
    Product::factory()->published()->featured()->create(['price' => 500]);

    $asc = $this->getJson('/api/v1/products?featured=1&sort=price_asc');
    expect(collect($asc->json('data'))->pluck('price')->all())->toBe(['100.00', '500.00', '900.00']);

    $desc = $this->getJson('/api/v1/products?featured=1&sort=price_desc');
    expect(collect($desc->json('data'))->pluck('price')->all())->toBe(['900.00', '500.00', '100.00']);
});

test('featured filter paginates with correct meta', function () {
    Product::factory()->published()->featured()->count(5)->create();
    Product::factory()->published()->count(4)->create(); // not featured, must not pad page 1

    $page1 = $this->getJson('/api/v1/products?featured=1&per_page=2');
    expect($page1->json('current_page'))->toBe(1)
        ->and($page1->json('total'))->toBe(5)
        ->and($page1->json('per_page'))->toBe(2)
        ->and($page1->json('last_page'))->toBe(3)
        ->and(count($page1->json('data')))->toBe(2);

    $page3 = $this->getJson('/api/v1/products?featured=1&per_page=2&page=3');
    expect($page3->json('current_page'))->toBe(3)
        ->and($page3->json('total'))->toBe(5)
        ->and(count($page3->json('data')))->toBe(1);
});

// ─── 7. Invalid featured value -> 422 ────────────────────────────────────────

test('an invalid featured query value returns 422 with a field error', function () {
    Product::factory()->published()->featured()->create();

    $this->getJson('/api/v1/products?featured=junk')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['featured']);

    $this->getJson('/api/v1/products?featured=2')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['featured']);

    $this->getJson('/api/v1/products?featured[]=1')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['featured']);
});

test('an invalid featured value does not silently fall back to an unfiltered list', function () {
    // The dangerous failure mode: junk is dropped, the filter is ignored, and
    // the client receives every product as if it had asked for featured only.
    Product::factory()->published()->count(3)->create();

    expect($this->getJson('/api/v1/products?featured=junk')->status())->toBe(422);
});

test('an invalid featured value on the admin list also returns 422', function () {
    $this->actingAs($this->featuredFlagAdmin)
        ->getJson('/api/v1/admin/products?featured=junk')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['featured']);
});

// ─── 8. Payloads expose is_featured as a real boolean ────────────────────────

test('public list payload exposes is_featured as a boolean, always present', function () {
    Product::factory()->published()->featured()->create();
    Product::factory()->published()->create();

    $response = $this->getJson('/api/v1/products');

    $rows = $response->json('data');
    expect($rows)->toHaveCount(2);

    foreach ($rows as $row) {
        expect($row)->toHaveKey('is_featured')
            ->and($row['is_featured'])->toBeBool();
    }

    // Default listing order is created_at DESC, id DESC — both rows share a
    // created_at second here, so the order is not worth pinning. Compare the
    // set instead.
    expect(collect($rows)->pluck('is_featured')->all())->toEqualCanonicalizing([true, false]);
});

test('public detail payload exposes is_featured as a boolean', function () {
    $product = Product::factory()->published()->featured()->create();

    $response = $this->getJson("/api/v1/products/{$product->slug}");

    $response->assertOk()->assertJsonPath('product.is_featured', true);
    expect($response->json('product.is_featured'))->toBeBool();
});

test('admin list and detail payloads expose is_featured as a boolean', function () {
    $featured = Product::factory()->featured()->create();
    $plain = Product::factory()->create();

    $list = $this->actingAs($this->featuredFlagAdmin)->getJson('/api/v1/admin/products');
    $list->assertOk();

    $flags = collect($list->json('data'))->pluck('is_featured', 'id')->all();
    expect($flags[$featured->id])->toBeTrue()
        ->and($flags[$plain->id])->toBeFalse()
        ->and($flags[$plain->id])->toBeBool();

    $this->actingAs($this->featuredFlagAdmin)
        ->getJson("/api/v1/admin/products/{$featured->id}")
        ->assertOk()
        ->assertJsonPath('product.is_featured', true);
});

test('the model casts is_featured to a real bool rather than leaking 0 or 1', function () {
    $product = Product::factory()->create(['is_featured' => true]);

    expect($product->refresh()->is_featured)->toBeTrue()->toBeBool();

    // Raw DB value stays a 0/1 integer; only the cast layer normalises it.
    $raw = DB::table('products')->where('id', $product->id)->value('is_featured');
    expect($raw)->toBe(1);
});

// ─── 9. Admin list: see the flag, and filter by it ───────────────────────────

test('admin list can filter by featured', function () {
    $featured = Product::factory()->featured()->count(2)->create();
    Product::factory()->count(3)->create();

    $response = $this->actingAs($this->featuredFlagAdmin)
        ->getJson('/api/v1/admin/products?featured=1');

    $response->assertOk();
    expect($response->json('total'))->toBe(2)
        ->and(collect($response->json('data'))->pluck('id')->all())
        ->toEqualCanonicalizing($featured->pluck('id')->all());
});

test('admin featured filter still shows unpublished featured products', function () {
    // The admin list is the one place a draft IS visible, otherwise an admin
    // could never find the draft they just featured.
    $draft = Product::factory()->featured()->create(['is_published' => false]);

    $response = $this->actingAs($this->featuredFlagAdmin)
        ->getJson('/api/v1/admin/products?featured=1');

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.id'))->toBe($draft->id);
});

test('admin featured filter composes with the existing status filter', function () {
    Product::factory()->published()->featured()->create();
    Product::factory()->featured()->create(); // featured, unpublished

    $response = $this->actingAs($this->featuredFlagAdmin)
        ->getJson('/api/v1/admin/products?featured=1&status=published');

    expect($response->json('total'))->toBe(1)
        ->and($response->json('data.0.is_published'))->toBeTrue();
});

// ─── Model, schema and factory ──────────────────────────────────────────────

test('the composite (is_published, is_featured) index exists and leads with is_published', function () {
    // Asserted because the migration's comment claims this index serves the
    // public "published AND featured" query — that claim should be enforced,
    // not just asserted in prose. Read via PRAGMA, matching the existing
    // index/FK tests in this suite.
    $indexes = collect(DB::select("PRAGMA index_list('products')"))->keyBy('name');

    expect($indexes)->toHaveKey('products_is_published_is_featured_index');

    $columns = collect(DB::select("PRAGMA index_info('products_is_published_is_featured_index')"))
        ->pluck('name')
        ->all();

    // Leftmost prefix must be is_published: that is what lets this one index
    // also serve the pre-existing published-only queries.
    expect($columns)->toBe(['is_published', 'is_featured']);

    // The original single-column index is deliberately left in place (the
    // migration is additive, so nothing is dropped).
    expect($indexes)->toHaveKey('products_is_published_index');
});

test('the products table has a NOT NULL is_featured column defaulting to false', function () {
    expect(Schema::hasColumn('products', 'is_featured'))->toBeTrue();

    $column = collect(DB::select("PRAGMA table_info('products')"))->keyBy('name')->get('is_featured');

    expect($column->notnull)->toEqual(1);

    // The DB default really is falsey, read straight from sqlite_master.
    // SQLite records a boolean default in quoted form: tinyint(1) not null default '0'.
    $sql = DB::select("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")[0]->sql;
    expect($sql)->toMatch('/is_featured"?\s+tinyint\(1\)\s+not null default \'0\'/i');
});

test('the factory defaults is_featured to false and offers a featured state', function () {
    expect(Product::factory()->create()->is_featured)->toBeFalse();
    expect(Product::factory()->featured()->create()->is_featured)->toBeTrue();
});

test('featured() composes with published() and forBrand()', function () {
    $brand = Brand::factory()->create();
    $product = Product::factory()->published()->featured()->forBrand($brand)->create();

    expect($product->is_featured)->toBeTrue()
        ->and($product->is_published)->toBeTrue()
        ->and($product->brand_id)->toBe($brand->id);
});

test('there is no server-side cap on how many products may be featured', function () {
    // The storefront decides how many featured products to show; the backend
    // deliberately imposes no limit (see the task decision).
    Product::factory()->featured()->count(25)->create();

    $admin = User::factory()->create(['role_id' => Role::where('slug', 'admin')->first()->id]);

    $response = $this->actingAs($admin)
        ->getJson('/api/v1/admin/products?featured=1&per_page=100');

    expect($response->json('total'))->toBe(25);
});
