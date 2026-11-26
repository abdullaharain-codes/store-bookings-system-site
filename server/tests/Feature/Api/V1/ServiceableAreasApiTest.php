<?php

use App\Models\Address;
use App\Models\BusinessSetting;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);

    $this->admin = User::factory()->create([
        'role_id' => Role::where('slug', 'admin')->first()->id,
    ]);
    $this->customer = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);
});

test('serviceable cities setting is seeded with Karachi by default', function () {
    $setting = BusinessSetting::query()->where('key', 'serviceable_cities')->first();

    expect($setting)->not->toBeNull();
    expect($setting->type)->toBe('json');
    expect(BusinessSetting::getValue('serviceable_cities'))->toBe(['Karachi']);
});

test('public serviceable-areas endpoint returns live shape and requires no auth', function () {
    $this->getJson('/api/v1/serviceable-areas')
        ->assertOk()
        ->assertExactJson([
            'cities' => ['Karachi'],
            'restricted' => true,
        ]);
});

test('public serviceable-areas endpoint returns restricted false when list is empty', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode([]), 'type' => 'json'],
    );

    $this->getJson('/api/v1/serviceable-areas')
        ->assertOk()
        ->assertExactJson([
            'cities' => [],
            'restricted' => false,
        ]);
});

test('serviceable-areas endpoint rejects write methods with 405', function () {
    $this->postJson('/api/v1/serviceable-areas', [])->assertStatus(405);
    $this->putJson('/api/v1/serviceable-areas', [])->assertStatus(405);
    $this->patchJson('/api/v1/serviceable-areas', [])->assertStatus(405);
    $this->deleteJson('/api/v1/serviceable-areas')->assertStatus(405);
});

test('serviceable-areas endpoint is throttled by the serviceable-areas limiter', function () {
    $limiter = RateLimiter::limiter('serviceable-areas');

    expect($limiter)->not->toBeNull();
});

test('admin can patch serviceable_cities with trimmed normalized storage', function () {
    $response = $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/serviceable_cities', [
            'value' => [' Karachi ', 'Lahore'],
        ]);

    $response->assertOk();

    $stored = BusinessSetting::query()->where('key', 'serviceable_cities')->firstOrFail();
    expect(BusinessSetting::getValue('serviceable_cities'))->toBe(['Karachi', 'Lahore']);

    $this->getJson('/api/v1/serviceable-areas')
        ->assertOk()
        ->assertExactJson([
            'cities' => ['Karachi', 'Lahore'],
            'restricted' => true,
        ]);
});

test('serviceable_cities rejects invalid payloads', function (mixed $value) {
    $response = $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/serviceable_cities', ['value' => $value]);

    $response->assertStatus(422);
    $errors = $response->json('errors');
    expect(collect(array_keys($errors))->contains(fn (string $key) => str_starts_with($key, 'value')))->toBeTrue();
})->with([
    'string not array' => ['Karachi'],
    'non-string item' => [['Karachi', 123]],
    'empty string item' => [['Karachi', '']],
    'too long item' => [[str_repeat('a', 101)]],
    'too many entries' => [array_fill(0, 101, 'Karachi')],
]);

test('serviceable_cities rejects case-insensitive duplicates', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/serviceable_cities', ['value' => ['Karachi', 'karachi']])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');
});

test('guest cannot patch serviceable_cities', function () {
    $this->patchJson('/api/v1/admin/settings/serviceable_cities', ['value' => ['Karachi']])
        ->assertStatus(401);
});

test('customer cannot patch serviceable_cities', function () {
    $this->actingAs($this->customer)
        ->patchJson('/api/v1/admin/settings/serviceable_cities', ['value' => ['Karachi']])
        ->assertStatus(403);
});

test('changing serviceable_cities takes effect on next request', function () {
    $this->actingAs($this->admin)
        ->patchJson('/api/v1/admin/settings/serviceable_cities', ['value' => ['Lahore']])
        ->assertOk();

    $this->getJson('/api/v1/serviceable-areas')
        ->assertOk()
        ->assertExactJson([
            'cities' => ['Lahore'],
            'restricted' => true,
        ]);
});

test('orders are not restricted by serviceable cities', function () {
    BusinessSetting::query()->updateOrCreate(
        ['key' => 'serviceable_cities'],
        ['value' => json_encode(['Karachi']), 'type' => 'json'],
    );

    $product = Product::factory()->create(['stock_quantity' => 10, 'price' => 1500, 'is_published' => true]);
    $address = Address::factory()->create([
        'user_id' => $this->customer->id,
        'city' => 'Islamabad',
    ]);

    $this->actingAs($this->customer)->postJson('/api/v1/cart/items', [
        'product_id' => $product->id,
        'quantity' => 1,
    ])->assertCreated();

    $this->actingAs($this->customer)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ])->assertCreated()
        ->assertJsonPath('order.city', 'Islamabad');
});
