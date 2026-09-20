<?php

namespace App\Modules\Orders\Exceptions;

use App\Shared\Exceptions\DomainValidationException;

/**
 * Business-rule validation failure during order creation or checkout
 * (e.g. empty cart, expired hold).  Maps to 422 via the centralized
 * DomainValidationException render callback in bootstrap/app.php.
 */
class OrderValidationException extends DomainValidationException {}
