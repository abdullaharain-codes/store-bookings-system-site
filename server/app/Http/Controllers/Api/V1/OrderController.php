<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Modules\Orders\Http\Requests\PlaceOrderRequest;
use App\Modules\Orders\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orderService,
    ) {}

    /**
     * POST /orders — place an order from the user's current cart.
     */
    public function store(PlaceOrderRequest $request): JsonResponse
    {
        $order = $this->orderService->placeOrder(
            $request->user(),
            $request->validated('address_id'),
        );

        return response()->json([
            'order' => $order->load('items'),
        ], 201);
    }

    /**
     * GET /orders — paginated list of the user's orders.
     */
    public function index(Request $request): JsonResponse
    {
        $orders = $this->orderService->listOrders($request->user());

        return response()->json([
            'orders' => $orders,
        ]);
    }

    /**
     * GET /orders/{order} — a single order with items.
     *
     * getOrder() takes an int $orderId.  We extract the ID from the
     * route-bound model to stay consistent with the service layer's
     * ownership-check pattern (findOrFail + manual ownership guard).
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        $order = $this->orderService->getOrder($request->user(), $order->id);

        return response()->json([
            'order' => $order,
        ]);
    }

    /**
     * POST /orders/{order}/cancel — customer cancels their own pending order.
     */
    public function cancel(Request $request, Order $order): JsonResponse
    {
        $order = $this->orderService->cancelOrder($request->user(), $order);

        return response()->json([
            'order' => $order,
        ]);
    }
}
