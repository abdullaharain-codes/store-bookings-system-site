<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Modules\Orders\Http\Requests\UpdateOrderStatusRequest;
use App\Modules\Orders\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orderService,
    ) {}

    /**
     * GET /admin/orders — paginated list of all orders, filterable.
     */
    public function index(Request $request): JsonResponse
    {
        $orders = $this->orderService->listAllForAdmin(
            $request->only(['status', 'user_id', 'order_number', 'per_page']),
        );

        return response()->json([
            'orders' => $orders,
        ]);
    }

    /**
     * GET /admin/orders/{order} — full order detail with items, no ownership restriction.
     */
    public function show(Order $order): JsonResponse
    {
        $order = $this->orderService->getOrderForAdmin($order->id);

        return response()->json([
            'order' => $order,
        ]);
    }

    /**
     * PATCH /admin/orders/{order}/status — transition order status.
     *
     * If the requested status is 'cancelled', route to cancelOrder()
     * (stock restoration).  Otherwise route to transitionStatus().
     */
    public function updateStatus(UpdateOrderStatusRequest $request, Order $order): JsonResponse
    {
        $newStatus = $request->validated('status');

        if ($newStatus === 'cancelled') {
            $order = $this->orderService->cancelOrder(
                $request->user(),
                $order,
                isAdmin: true,
            );
        } else {
            $order = $this->orderService->transitionStatus($order, $newStatus);
        }

        return response()->json([
            'order' => $order,
        ]);
    }
}
