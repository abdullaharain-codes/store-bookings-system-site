<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Modules\Orders\Http\Requests\StoreAddressRequest;
use App\Modules\Orders\Http\Requests\UpdateAddressRequest;
use App\Modules\Orders\Services\AddressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AddressController extends Controller
{
    public function __construct(
        private readonly AddressService $addressService,
    ) {}

    /**
     * GET /addresses — the authenticated user's saved addresses.
     */
    public function index(Request $request): JsonResponse
    {
        $addresses = $this->addressService->listAddresses($request->user());

        return response()->json([
            'addresses' => $addresses,
        ]);
    }

    /**
     * POST /addresses — create a new address.
     */
    public function store(StoreAddressRequest $request): JsonResponse
    {
        $address = $this->addressService->createAddress(
            $request->user(),
            $request->validated(),
        );

        return response()->json([
            'address' => $address,
        ], 201);
    }

    /**
     * PUT /addresses/{address} — update an existing address.
     */
    public function update(UpdateAddressRequest $request, Address $address): JsonResponse
    {
        $updated = $this->addressService->updateAddress(
            $request->user(),
            $address,
            $request->validated(),
        );

        return response()->json([
            'address' => $updated,
        ]);
    }

    /**
     * DELETE /addresses/{address} — remove an address.
     */
    public function destroy(Request $request, Address $address): JsonResponse
    {
        $this->addressService->deleteAddress($request->user(), $address);

        return response()->json([
            'message' => 'Address deleted.',
        ]);
    }

    /**
     * POST /addresses/{address}/default — set an address as the user's default.
     */
    public function setDefault(Request $request, Address $address): JsonResponse
    {
        $this->addressService->setDefaultAddress($request->user(), $address);

        return response()->json([
            'message' => 'Default address updated.',
        ]);
    }
}
