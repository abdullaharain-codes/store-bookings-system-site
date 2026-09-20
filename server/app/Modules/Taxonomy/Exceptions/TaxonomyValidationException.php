<?php

namespace App\Modules\Taxonomy\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Base exception for taxonomy business-rule violations. Inherits the
 * centralized 422 mapping via DomainValidationException (architecture.md §8).
 */
class TaxonomyValidationException extends DomainValidationException {}
