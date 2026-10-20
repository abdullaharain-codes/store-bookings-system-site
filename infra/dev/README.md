# Backend test infra (dev only)

Local container for running the Laravel backend test suite. **Not used for the
Hostinger production deployment.** Nothing in this directory is uploaded,
built or referenced by the production deploy path — production runs on
Hostinger shared hosting, which has no Docker involvement. The production PHP
version there is **UNVERIFIED pending Hostinger confirmation**; see
"Why PHP 8.5 and not 8.3" below for why the dev image cannot tell you.

## Why this exists

The Windows host has Smart App Control enabled
(`HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy` →
`VerifiedAndReputablePolicyState = 1`). It blocks the host's GD extension at
load time:

```
PHP Warning: PHP Startup: Unable to load dynamic library 'gd'
(tried: ext\gd (The specified module could not be found),
 ext\php_gd.dll (An Application Control policy has blocked this file))

Code Integrity 3033 — ...\ext\php_gd.dll did not meet the Enterprise
signing level requirements.
```

`php_gd.dll` is present and has the same trust attributes as extensions that
load fine (`NotSigned`, no MOTW), so the block is Smart App Control's
per-file cloud reputation, not the signature.

This matters because `server/app/Shared/FileUploadService.php` hard-codes
Intervention's GD driver (`use Intervention\Image\Drivers\Gd\Driver;`,
`new ImageManager(new Driver)` in the constructor). Intervention's
`AbstractDriver::__construct` calls `checkHealth()` immediately, so merely
resolving the service throws — and `ProductService` and `AssetController`
inject it. A missing GD therefore 500s *every* `/api/v1/admin/products`
request, not just uploads.

## Database

There is deliberately **no database service**. `server/phpunit.xml` pins
`DB_CONNECTION=sqlite` and `DB_DATABASE=":memory:"`, so the suite is
self-contained.

Note on the booking-concurrency tests
(`BookingServiceTest`, `SlotHoldServiceTest`): they run on SQLite in-memory
too. They are *sequential* simulations — no `lockForUpdate`/`sharedLock`
anywhere in `server/tests` — so they do not exercise MySQL row-locking
semantics on either SQLite or MySQL. Nothing here needs real MySQL.

## Requirements

- Docker Desktop running (`docker version` must return a server version).

## Commands

Run from this directory (`infra/dev`), or use `-f infra/dev/docker-compose.yml`
from the repo root.

```powershell
# One-time: build the image (needs network for apt + composer packages)
docker compose build

# Run the suite (prints php -v, php -m | grep -i gd, composer install, then tests)
docker compose run --rm api

# Just prove the extensions, no tests
docker compose run --rm api sh -lc "php -v; php -m | grep -i gd"

# Watch mode while developing
docker compose run --rm api sh -lc "composer install; php artisan test --watch"

# Run a single file / filter
docker compose run --rm api sh -lc "php artisan test tests/Feature/Shared/FileUploadServiceTest.php"

# Tear down (keeps the vendor volume)
docker compose down

# Full reset, including the composer vendor volume
docker compose down -v
```

## How the mounts are set up (and why)

| Mount | Type | Reason |
|---|---|---|
| `../../server:/app` | bind, read-write | artisan writes `storage/logs`, `storage/framework` and `bootstrap/cache` during a run |
| `vendor:/app/vendor` | **named volume** | `composer install` must not write `vendor/` through the OneDrive bind mount — slow and flaky — and must not clobber the host's Windows-built `vendor/` tree |

`node_modules` is **not** needed in the container; the container runs no JS.

The composer vendor volume is Linux-built, so `server/vendor` on the host stays
usable by the native Windows PHP. If you need to drop the volume, run
`docker compose down -v`.

## Installed PHP extensions

`gd` (jpeg, png, webp, freetype), `pdo_mysql`, `bcmath`, `zip`, `mbstring`,
`curl`, plus everything already compiled into the official `php:8.5-cli` image
(`pdo_sqlite`, `sqlite3`, `openssl`, `tokenizer`, `dom`, `fileinfo`, `ctype`,
`json`, `Zend OPcache`, ...).

Extensions are matched to the host set so test behaviour is not silently
different from the Windows run. `intl` and `sodium` are deliberately **not**
installed — the host has neither, and `intl` fails to compile on PHP 8.5
(`cp: cannot stat 'modules/*'`). `opcache` is not installed because PHP 8.5
compiles Zend OPcache statically into the binary.

## Why PHP 8.5 and not 8.3

`php:8.3-cli` cannot install this project's dependencies:

```
symfony/error-handler is locked to version v8.1.2 ...
symfony/error-handler v8.1.2 requires php >=8.4.1 -> your php version (8.3.35)
does not satisfy that requirement.
```

`server/composer.lock` pins Symfony 8.1 components and `laravel/framework`
13.25, all requiring **php >= 8.4.1**, while `server/composer.json` still
declares `php: ^8.3` — that constraint is stale relative to the lock.
`composer update` is deliberately not run here because it would rewrite the
lock file.

8.5 is used so the container matches the runtime the suite was last green on
(host PHP 8.5.9). `php:8.4-cli` would also satisfy the lock if you would rather
stay closer to the declared `^8.3`.

This is a statement about the **dev image only**. The PHP version Hostinger
actually runs in production is **UNVERIFIED pending Hostinger confirmation**,
and this container provides no evidence about it. Before go-live, confirm the
production PHP version and that `php -m` lists `gd` there.

## Baseline

`631 passed`, 2407 assertions, ~155–185s (PHP 8.5.11, GD enabled).
