# RUNBOOK-1 (local dev) — API + Storefront up and verified

## Prerequisites
- Docker Desktop running
- Node/npm installed
- Host PHP blocked by Smart App Control (gd) — use Docker for API

## Important gotcha
**Never create a new vendor volume.** Use the existing external volume `ecommerce-dev_vendor` (contains `vendor/autoload.php`). The dev-serve compose declares it as `external: true` with name `ecommerce-dev_vendor`.

## Ports/URLs (verified)
- API: http://localhost:8000 (api/v1). Health: http://localhost:8000/up (200). Categories: http://localhost:8000/api/v1/categories (200)
- Storefront: http://localhost:5173/ (200), http://localhost:5173/login (200)
- Admin (separate): http://localhost:5174

## VITE_API_URL
`packages/api-client/src/api-client.ts` defaults to `http://localhost:8000/api/v1`. No `.env` required unless overriding.

## Start (working)

### API (Docker)
From repo root:
```powershell
docker compose -f infra/dev/docker-compose.dev-serve.yml up -d
```
Uses external `ecommerce-dev_vendor` (no composer install), creates `.env` from `.env.example` if missing, generates APP_KEY if empty, sets SESSION_DRIVER=database, SANCTUM_STATEFUL_DOMAINS for localhost:5173/5174, SESSION_DOMAIN=localhost, creates sqlite DB, runs migrations, serves on :8000.

### Storefront (host, background)
From repo root:
```powershell
Start-Process powershell -ArgumentList "-NoExit","-Command","npm --workspace storefront-app run dev" -WorkingDirectory "C:\Users\Muhammad Abdullah\OneDrive\Desktop\E-commerce"
```
Or: `npm --workspace storefront-app run dev` (port 5173)

## Create users
```powershell
# Admin (non-interactive)
docker exec ecommerce-dev-serve-api-serve-1 sh -lc "cd /app && php artisan admin:create --name='Admin User' --email='admin@example.test' --password='<choose-a-local-password>'"

```
Or register via UI at http://localhost:5173/register.
Customer users for local testing: register at /register (the former broken customer-creation one-liner was removed on 2026-11-20).

## Dev test accounts (throwaway)
These are local throwaway accounts. Never reuse their credentials elsewhere and never create them on production.
- Customer: `customer@example.test` / (the password you chose when you registered)
- Admin: `admin@example.test` / (the password you passed to admin:create)

## Stop
```powershell
docker compose -f infra/dev/docker-compose.dev-serve.yml down
# Stop storefront PowerShell window (Ctrl+C)
```

## Notes
- gd warning: use Docker API (host ext-gd blocked by Smart App Control).
- SESSION_DRIVER must be database.
