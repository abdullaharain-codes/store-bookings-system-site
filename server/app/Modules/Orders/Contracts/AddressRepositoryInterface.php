<?php

namespace App\Modules\Orders\Contracts;

use App\Models\Address;
use App\Models\User;
use Illuminate\Support\Collection;

interface AddressRepositoryInterface
{
    /** All addresses belonging to a user. */
    public function findForUser(User $user): Collection;

    /** Find a single address by ID (ownership check is the caller's job). */
    public function find(int $id): ?Address;

    /** Create a new address for a user. */
    public function create(User $user, array $data): Address;

    /** Update an existing address (ownership already verified by caller). */
    public function update(Address $address, array $data): Address;

    /** Delete an address (ownership already verified by caller). */
    public function delete(Address $address): void;

    /**
     * Set an address as the user's default.  Unsets is_default on the user's
     * other addresses first (single-default invariant).
     */
    public function setDefault(Address $address): void;
}
