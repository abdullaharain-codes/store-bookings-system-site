<?php

use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutMiddleware(ValidateCsrfToken::class);
});

/**
 * Redirect-and-resume integration test (phases.md Phase 4 Testing section).
 *
 * This test proves the BACKEND CONTRACT that makes redirect-and-resume
 * possible: an unauthenticated attempt to add-to-cart returns 401, and
 * the exact same request succeeds once authenticated.  The actual
 * client-side capture/replay mechanics (pending-action store) are frontend
 * logic in packages/api-client and verified structurally in Phase 3's
 * frontend check; this test proves the backend half of the contract
 * (architecture.md §5.1).
 */
test('redirect-and-resume checkout flow: guest blocked then authenticated user succeeds with identical payload', function () {
    $product = Product::factory()->create(['stock_quantity' => 10, 'is_published' => true]);

    // ── Step 1: Guest attempts add-to-cart → 401 ──
    // Simulates a guest browsing, clicking "Add to Cart", being blocked.
    $payload = ['product_id' => $product->id, 'quantity' => 2];

    $guestResponse = $this->postJson('/api/v1/cart/items', $payload);
    $guestResponse->assertStatus(401);

    // ── Step 2: Guest registers/logs in ──
    // Simulates the redirect to Sign In and successful authentication.
    $user = User::factory()->create([
        'role_id' => Role::where('slug', 'customer')->first()->id,
    ]);

    // ── Step 3: Authenticated user replays the SAME request → 201 ──
    // This is the "resume exactly where the guest left off" behavior
    // from architecture.md §5.1.  The backend never trusts the frontend's
    // replay blindly — the resumed request goes through the exact same
    // validation/authorization as any fresh request (rules.md §8).
    $resumeResponse = $this->actingAs($user)->postJson('/api/v1/cart/items', $payload);

    $resumeResponse->assertCreated()
        ->assertJsonPath('cart_item.quantity', 2)
        ->assertJsonPath('cart_item.product.id', $product->id);

    // ── Step 4: Verify the item is actually in the user's cart ──
    $cartResponse = $this->actingAs($user)->getJson('/api/v1/cart');
    $cartResponse->assertOk()
        ->assertJsonCount(1, 'cart.items')
        ->assertJsonPath('cart.items.0.quantity', 2)
        ->assertJsonPath('cart.items.0.product.id', $product->id);
});
