<?php

namespace App\Shared\Exceptions;

use RuntimeException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Thrown when a resource is inaccessible to the requesting user — either
 * it genuinely does not exist, or it exists but the user lacks ownership.
 * Both cases produce an identical 404 response so the client cannot
 * distinguish between "resource missing" and "resource belongs to someone
 * else" (architecture.md §10).
 *
 * Distinct from DomainValidationException (which maps to 422): this is
 * an access-control concern, not a business-rule validation concern.
 *
 * The render() method throws a NotFoundHttpException so the render
 * callback in bootstrap/app.php normalises both this exception and a
 * genuine route-model-binding failure to the same {"message":"Not Found"}
 * body in every environment.
 */
class ResourceNotFoundException extends RuntimeException
{
    /**
     * Convert the exception into an HTTP response.
     *
     * Delegates to the NotFoundHttpException render callback in
     * bootstrap/app.php by throwing one directly.  This avoids
     * duplicating JSON-response logic and guarantees the same body
     * as a genuine "not found" route-model-binding failure.
     *
     * @throws NotFoundHttpException
     */
    public function render($request): never
    {
        throw new NotFoundHttpException('Not Found');
    }
}
