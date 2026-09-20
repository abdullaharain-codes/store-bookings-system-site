<?php

namespace App\Modules\ReviewShowcase\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Review Showcase violation. Inherits the centralized 422 mapping via
 * DomainValidationException (architecture.md §8).
 */
class ReviewShowcaseValidationException extends DomainValidationException {}
