<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Modules\Catalog\Http\Requests\AddCartItemRequest;
use App\Modules\Catalog\Http\Requests\UpdateCartItemQuantityRequest;
use App\Modules\Catalog\Services\CartService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CartController extends Controller
{
    public function __construct(
        private readonly CartService $cart,
    ) {}

    /**
     * GET /cart — the authenticated user's cart with items + products.
     */
    public function index(Request $request): JsonResponse
    {
        $cart = $this->cart->getCart($request->user());

        return response()->json([
            'cart' => $cart,
        ]);
    }

    /**
     * POST /cart/items — add a product (or increase quantity if already in cart).
     * Returns 201 with the created/updated cart_item.
     */
    public function store(AddCartItemRequest $request): JsonResponse
    {
        $item = $this->cart->addItem(
            $request->user(),
            $request->validated('product_id'),
            $request->validated('quantity'),
        );

        return response()->json([
            'cart_item' => $item->load('product'),
        ], 201);
    }

    /**
     * PATCH /cart/items/{cartItem} — replace quantity. 0 delegates to remove.
     *
     * Ownership is checked inside CartService (throws CartValidationException
     * → 422 via the existing exception mapping). A wrong-owner request
     * surfaces 422 — see IDOR leak note in deliverable report.
     */
    public function update(UpdateCartItemQuantityRequest $request, CartItem $cartItem): JsonResponse
    {
        $item = $this->cart->updateQuantity(
            $request->user(),
            $cartItem,
            $request->validated('quantity'),
        );

        return response()->json([
            'cart_item' => $item->load('product'),
            'message' => 'Cart item updated.',
        ]);
    }

    /**
     * DELETE /cart/items/{cartItem} — permanently remove the item.
     */
    public function destroy(Request $request, CartItem $cartItem): JsonResponse
    {
        $this->cart->removeItem($request->user(), $cartItem);

        return response()->json([
            'message' => 'Cart item removed.',
        ]);
    }
}
