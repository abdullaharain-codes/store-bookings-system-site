<?php

namespace App\Modules\Catalog\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Thrown when product business rules are violated (slug/SKU collisions,
 * unknown category/asset references). Inherits the centralized 422 mapping
 * via DomainValidationException — no dedicated render callback needed.
 */
class ProductValidationException extends DomainValidationException {}
