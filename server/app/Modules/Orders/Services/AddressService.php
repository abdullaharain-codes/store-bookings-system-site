<?php

namespace App\Modules\Orders\Services;

use App\Models\Address;
use App\Models\User;
use App\Modules\Orders\Contracts\AddressRepositoryInterface;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Support\Collection;

/**
 * CRUD service for the authenticated user's saved addresses.
 * Ownership checks throw ResourceNotFoundException (→ 404) — never leak
 * the existence of another user's address (architecture.md §10).
 */
class AddressService
{
    public function __construct(
        private readonly AddressRepositoryInterface $addressRepo,
    ) {}

    /** List all addresses belonging to the user. */
    public function listAddresses(User $user): Collection
    {
        return $this->addressRepo->findForUser($user);
    }

    /** Create a new address. */
    public function createAddress(User $user, array $data): Address
    {
        return $this->addressRepo->create($user, $data);
    }

    /** Update an address — ownership-checked. */
    public function updateAddress(User $user, Address $address, array $data): Address
    {
        $this->assertOwnership($user, $address);

        return $this->addressRepo->update($address, $data);
    }

    /** Delete an address — ownership-checked. */
    public function deleteAddress(User $user, Address $address): void
    {
        $this->assertOwnership($user, $address);
        $this->addressRepo->delete($address);
    }

    /** Set an address as the user's default — ownership-checked. */
    public function setDefaultAddress(User $user, Address $address): void
    {
        $this->assertOwnership($user, $address);
        $this->addressRepo->setDefault($address);
    }

    /**
     * Ownership guard — prevents IDOR by ensuring the address belongs to
     * the authenticated user (architecture.md §5, §10).
     *
     * @throws ResourceNotFoundException
     */
    private function assertOwnership(User $user, Address $address): void
    {
        if ($address->user_id !== $user->id) {
            throw new ResourceNotFoundException;
        }
    }
}
