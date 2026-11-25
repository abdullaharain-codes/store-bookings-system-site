<?php

use App\Models\Address;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createOrderReadyCart(User $user): void
{
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);
    CartItem::factory()->create([
        'cart_id' => $user->cart()->create()->id,
        'product_id' => $product->id,
        'quantity' => 1,
        'hold_expires_at' => now()->addMinutes(10),
    ]);
}

it('rejects order placement when user gender is null', function () {
    $user = User::factory()->create(['gender' => null]);
    $address = Address::factory()->for($user)->create();
    createOrderReadyCart($user);

    $response = $this->actingAs($user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Please set your gender in your profile before placing an order.');
});

it('rejects order placement when address map_link is null', function () {
    $user = User::factory()->create(['gender' => 'female']);
    $address = Address::factory()->for($user)->create(['map_link' => null]);
    createOrderReadyCart($user);

    $response = $this->actingAs($user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('message', 'Please add a Google Maps link to this address before placing an order.');
});

it('snapshots address map_link and customer gender onto the order', function () {
    $user = User::factory()->create(['gender' => 'male']);
    $address = Address::factory()->for($user)->create([
        'map_link' => 'https://maps.app.goo.gl/order123',
    ]);
    createOrderReadyCart($user);

    $response = $this->actingAs($user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('order.map_link', 'https://maps.app.goo.gl/order123')
        ->assertJsonPath('order.customer_gender', 'male');

    $this->assertDatabaseHas('orders', [
        'id' => $response->json('order.id'),
        'map_link' => 'https://maps.app.goo.gl/order123',
        'customer_gender' => 'male',
    ]);
});

it('keeps order snapshot intact after address deletion', function () {
    $user = User::factory()->create(['gender' => 'other']);
    $address = Address::factory()->for($user)->create([
        'map_link' => 'https://maps.app.goo.gl/keepme',
    ]);
    createOrderReadyCart($user);

    $place = $this->actingAs($user)->postJson('/api/v1/orders', [
        'address_id' => $address->id,
    ]);
    $place->assertStatus(201);
    $orderId = $place->json('order.id');

    $delete = $this->actingAs($user)->deleteJson("/api/v1/addresses/{$address->id}");
    $delete->assertOk();

    $this->assertDatabaseHas('orders', [
        'id' => $orderId,
        'address_id' => null,
        'map_link' => 'https://maps.app.goo.gl/keepme',
        'customer_gender' => 'other',
    ]);

    $show = $this->actingAs($user)->getJson("/api/v1/orders/{$orderId}");
    $show->assertOk()
        ->assertJsonPath('order.map_link', 'https://maps.app.goo.gl/keepme')
        ->assertJsonPath('order.customer_gender', 'other');
});
