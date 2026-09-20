<?php

namespace App\Modules\Reviews\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Base exception for Reviews business-rule violations (e.g. reviewing without
 * a qualifying purchase, or reviewing the same target twice). Inherits the
 * centralized 422 mapping via DomainValidationException (architecture.md §8).
 */
class ReviewsValidationException extends DomainValidationException {}
