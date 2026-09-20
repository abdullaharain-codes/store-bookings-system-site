<?php

namespace App\Console\Commands;

use App\Http\Requests\Auth\RegisterRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

/**
 * Provisions admin users — the intended way to create the FIRST admin in any
 * environment, including production. Safe by construction: it only ever
 * CREATES a user; it never resets, edits or deletes existing accounts.
 *
 * The password is hashed by the User model's 'hashed' cast (same path HTTP
 * registration uses) and is never printed or logged by this command.
 */
class CreateAdminUser extends Command
{
    protected $signature = 'admin:create {--name=} {--email=} {--password=}';

    protected $description = 'Create an admin user (interactive prompts for any missing options)';

    public function handle(): int
    {
        // Options first; anything missing is prompted interactively so the
        // command works both scripted (--flags) and hands-on.
        $name = $this->option('name') ?: $this->ask('Admin name');
        $email = $this->option('email') ?: $this->ask('Admin email');
        $password = $this->option('password') ?: $this->secret('Admin password');

        if ($name === null || $email === null || $password === null) {
            $this->error('Name, email and password are all required.');

            return self::FAILURE;
        }

        // Same validation rules as registration (RegisterRequest::baseRules),
        // including email uniqueness — a duplicate fails here before any
        // write happens.
        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $password],
            RegisterRequest::baseRules(),
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        // Same lookup + failure pattern as AuthController: without the role
        // row the user would exist but carry no permissions — refuse to
        // create that broken state. Logged loudly for ops triage.
        $adminRole = Role::query()->where('slug', 'admin')->first();

        if (! $adminRole) {
            Log::critical('Admin creation blocked: the required "admin" role is missing from the roles table. Check the roles migration/seed data.');

            $this->error('The required "admin" role is missing from the roles table. Check the roles migration/seed data.');

            return self::FAILURE;
        }

        // Password goes in plaintext; the model's 'hashed' cast does the
        // hashing — identical to AuthController::register, no reimplementation.
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'role_id' => $adminRole->id,
        ]);

        $this->info("Admin user created: {$user->email}");

        return self::SUCCESS;
    }
}
