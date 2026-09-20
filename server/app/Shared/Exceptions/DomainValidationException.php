<?php

namespace App\Shared\Exceptions;

use RuntimeException;

/**
 * Common base for module-level business-rule validation exceptions
 * (Taxonomy, Catalog, ...). The single render callback in bootstrap/app.php
 * maps ANY subclass to a 422 JSON response carrying the user-safe message,
 * so each new module needs zero additional exception-handler wiring.
 */
abstract class DomainValidationException extends RuntimeException {}
