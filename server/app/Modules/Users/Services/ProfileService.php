<?php

namespace App\Modules\Users\Services;

use App\Models\User;
use App\Modules\Users\Exceptions\UsersValidationException;
use App\Shared\AuditLogger;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

/**
 * Customer profile self-service (PRD Â§5.2). Seeded by the empty Users module,
 * so this class establishes its convention: App\Modules\Users\Services,
 * Services are callable and unit-testable in isolation (rules.md Â§3).
 *
 * Because every endpoint here acts on the authenticated user's OWN record
 * (auth:sanctum, no admin gate, no {id} in the route), there is no ownership
 * check to write â€” the "other user" case is unreachable (architecture.md Â§5).
 */
class ProfileService
{
    public function __construct(
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Apply the mutable profile fields. `name` and `gender` are editable; email
     * is deliberately withheld because it is the login identifier and this
     * codebase has no email-verification or re-confirmation flow.
     */
    public function updateProfile(User $user, array $data): User
    {
        $dirty = false;

        if (array_key_exists('name', $data)) {
            $user->name = $data['name'];
            $dirty = true;
        }

        if (array_key_exists('gender', $data)) {
            $user->gender = $data['gender'];
            $dirty = true;
        }

        if ($dirty) {
            $user->save();
        }

        return $user->load('role');
    }

    /**
     * Change the account password â€” only after proving ownership of the
     * CURRENT password (rules.md Â§9: never change a credential on session
     * alone). Audit-logged as a security-relevant action.
     *
     * @throws UsersValidationException when the current password is wrong
     */
    public function changePassword(User $user, string $currentPassword, string $newPassword): void
    {
        if (! Hash::check($currentPassword, $user->password)) {
            throw new UsersValidationException('The current password is incorrect.');
        }

        // The model's 'hashed' cast hashes on write â€” same path registration
        // and admin:create use, so the strength/format gate lives in the
        // request (RegisterRequest precedent) and never here.
        $user->update(['password' => $newPassword]);

        Auth::guard('web')->logoutOtherDevices($newPassword);

        $this->audit->log('User', $user->id, 'password_changed');
    }
}
