<?php

namespace App\Modules\Scheduling\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Base exception for Scheduling business-rule violations (e.g. a time slot
 * that is no longer available). Inherits the centralized 422 mapping via
 * DomainValidationException (architecture.md §8).
 */
class SchedulingValidationException extends DomainValidationException {}
