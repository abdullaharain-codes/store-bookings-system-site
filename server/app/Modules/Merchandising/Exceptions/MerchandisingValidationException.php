<?php

namespace App\Modules\Merchandising\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Base exception for merchandising (homepage banner) business-rule violations.
 * Inherits the centralized 422 mapping via DomainValidationException
 * (architecture.md §8).
 */
class MerchandisingValidationException extends DomainValidationException {}
