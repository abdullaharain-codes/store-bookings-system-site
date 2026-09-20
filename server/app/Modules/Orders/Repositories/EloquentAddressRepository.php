<?php

namespace App\Modules\Orders\Repositories;

use App\Models\Address;
use App\Models\User;
use App\Modules\Orders\Contracts\AddressRepositoryInterface;
use Illuminate\Support\Collection;

class EloquentAddressRepository implements AddressRepositoryInterface
{
    public function findForUser(User $user): Collection
    {
        return Address::where('user_id', $user->id)->get();
    }

    public function find(int $id): ?Address
    {
        return Address::find($id);
    }

    public function create(User $user, array $data): Address
    {
        // Ensure is_default is always explicitly set — the migration's
        // DB-level default (false) is correct, but the returned instance
        // should have the field populated without a refresh().
        return Address::create(array_merge([
            'is_default' => false,
        ], $data, ['user_id' => $user->id]));
    }

    public function update(Address $address, array $data): Address
    {
        $address->update($data);

        return $address->refresh();
    }

    public function delete(Address $address): void
    {
        $address->delete();
    }

    /**
     * Set an address as the user's default.  Clears is_default on all other
     * addresses for this user first, then sets the target.  Operates within
     * the caller's transaction if one is active.
     */
    public function setDefault(Address $address): void
    {
        Address::where('user_id', $address->user_id)
            ->where('id', '!=', $address->id)
            ->update(['is_default' => false]);

        $address->update(['is_default' => true]);
    }
}
