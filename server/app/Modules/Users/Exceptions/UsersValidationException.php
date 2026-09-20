<?php

namespace App\Modules\Users\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Base exception for user-profile business-rule violations. Inherits the
 * centralized 422 mapping via DomainValidationException (architecture.md §8).
 */
class UsersValidationException extends DomainValidationException {}
