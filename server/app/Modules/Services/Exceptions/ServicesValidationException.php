<?php

namespace App\Modules\Services\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Base exception for Services business-rule violations. Inherits the
 * centralized 422 mapping via DomainValidationException (architecture.md §8).
 */
class ServicesValidationException extends DomainValidationException {}
