<?php

use App\Http\Middleware\EnsureUserIsAdmin;
use App\Shared\Exceptions\DomainValidationException;
use App\Shared\Exceptions\ResourceNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->alias([
            'admin' => EnsureUserIsAdmin::class,
        ]);
        $middleware->redirectGuestsTo(fn () => null);
        // No 'spa' middleware group is defined. All session/cookie/CSRF
        // handling (StartSession, EncryptCookies, AddQueuedCookiesToResponse,
        // ValidateCsrfToken) is provided ONCE by statefulApi()'s
        // EnsureFrontendRequestsAreStateful, which ALSO enforces the
        // SANCTUM_STATEFUL_DOMAINS origin whitelist on session-cookie auth.
        // Duplicating any of these in a route-level group would start the
        // session twice and overwrite the authenticated cookie with an empty
        // one (the original 401 root cause). ShareErrorsFromSession is omitted
        // because it only feeds Laravel's $errors view-bag used by Blade
        // templates — no use on JSON-only API routes.
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Centralized business-rule mapping (architecture.md §8, rules.md §7):
        // any module's DomainValidationException subclass becomes a 422
        // carrying the service's user-safe message — controllers never
        // catch-and-format these, and new modules need no handler changes.
        $exceptions->render(function (DomainValidationException $e, Request $request) {
            return response()->json(['message' => $e->getMessage()], 422);
        });

        // Access-control 404: "resource not found" and "resource belongs to
        // someone else" must produce the same response so the client cannot
        // enumerate other users' resources (architecture.md §10).
        //
        // ResourceNotFoundException delegates to abort(404), which throws a
        // NotFoundHttpException.  This callback then intercepts ALL
        // NotFoundHttpExceptions (including route-model-binding failures) and
        // normalises them to {"message":"Not Found"} — the same body that
        // abort(404) was always intended to produce in JSON API context.  The
        // Laravel handler's default rendering leaks the ModelNotFoundException
        // message ("No query results for model [X] Y") in debug mode, which
        // would be indistinguishable only in production.  This normalisation
        // ensures byte-identical 404s in every environment.
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            return response()->json(['message' => 'Not Found'], 404);
        });
    })->create();
