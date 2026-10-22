# CLAUDE.md — Project memory (created 2026-10-20; regenerate if it drifts from phases.md)

## 1. What this is
Pakistani tech store + doorstep IT-service booking platform for a real client. Two revenue channels: COD-only
product e-commerce and smart-scheduled doorstep IT bookings. Monorepo (npm workspaces, root package.json):

```
/server            Laravel 13 API (/api/v1), PHP ^8.3 constraint (dev runtime 8.5.x)
/apps/storefront   React Router v7 Framework Mode (SPA mode ssr:false + prerender), Tailwind v4  [workspace: storefront-app]
/apps/admin        Plain Vite CSR SPA (scaffold + stub login only so far)                      [workspace: admin-app]
/packages/ui       Shared design system (@ecommerce/ui) + tokens.css (Tailwind v4)
/packages/api-client  Typed API client (@ecommerce/api-client) shared by both apps
/infra/dev         docker compose for the backend test env (php:8.5-cli, sqlite :memory:)
/design-reference  40 HTML/PNG prototype screens (visual target, gitignored)
scripts/check-built-css.mjs  Built-CSS guard (asserts ui classes present, 9/9 expected)
```

Dev ports: storefront 5173, admin 5174, API http://localhost:8000/api/v1 (VITE_API_URL fallback in api-client).
Storefront prerender set = `/`, `/shop`, `/services`, `/login`, `/register` + `__spa-fallback.html` ONLY
(/cart /checkout /wishlist /account/* never prerendered; dynamic slug routes join later).

## 2. Commands (all verified working 2026-10-21, Windows PowerShell, Docker up)
- Frontend tests: `npx vitest run` in apps/storefront (38 files/386), packages/api-client (17/231), packages/ui (30/241).
- Typecheck: delete `apps/storefront/node_modules/.tmp/*.tsbuildinfo` then `npm --workspace storefront-app exec -- tsc -b` (exit 0).
- Builds: `npm --workspace storefront-app run build`; `npm --workspace admin-app run build`;
  then `node scripts/check-built-css.mjs <built css>` on `apps/storefront/build/client/assets/root-*.css`
  and `apps/admin/dist/assets/index-*.css` (expect PASS 9/9).
- Lint: `npm --workspace storefront-app run lint 2>&1 | Select-String ': warning '` — baseline 11 warnings / 0 errors, never exceed.
- Backend: `cd infra/dev; docker compose run --rm api sh -lc "php artisan test <paths>"`; Pint via
  `docker compose run --rm api sh -lc "vendor/bin/pint <files>"`. Never run the full backend suite for a scoped task.
  (Host PHP is blocked by Smart App Control for ext-gd — always test in Docker, see phases.md.)

## 3. Document hierarchy
`PRD.md` / `SRS.md` (client spec — primary; conflicts are REPORTED, never silently changed) > `architecture.md`
> `rules.md` > `phases.md` (running log: one dated entry per task, newest at bottom; decisions as DECISION lines;
  it outranks PROJECT-HANDOVER notes — no handover file exists now). Never edit PRD.md. Edit SRS.md/architecture.md
  only when behaviour/contract actually changed.

## 4. WORKING AGREEMENT (strict)
- Tests FIRST: write test file before the implementation it covers, run it, SHOW the RED output, then implement.
  Never claim a RED that was not observed; if implementation came first, say so.
- One task = one vertical slice; frontend built against the real server contract. Every task starts with a read-only
  STEP 0 report of real API facts. A backend gap bigger than one small field/validation => STOP and report.
- Frontend VERIFY = FULL suites (storefront, api-client, ui) once each at default parallelism + `tsc -b` +
  storefront build + prerender check (every storefront task) + admin build (when ui/api-client changed) +
  check-built-css 9/9 both + lint <= 11 warnings, zero new warnings from new files.
  Backend VERIFY = scoped new/changed tests + existing tests of touched code + Pint.
  NEVER use --no-file-parallelism, retries, or skipped tests to get green. Any failure reported with file + test + message.
- Mutation proofs only where the prompt marks [MUTATE] (one-shot, revert, report the failure message).
- No rewrite one-liners on SOURCE files (`-replace | Set-Content`, Python/Node rewrite scripts) — use the edit tool
  for small targeted edits. Tests that assert an ABSENCE/emptiness must first assert the thing was PRESENT (e.g. the
  badge showed "Cart, 1 item" before it is gone), so the test cannot pass vacuously.
- No commits unless the owner says so (rules.md §11 wants feature branches; owner currently defers commits).
- SAFETY (absolute, no exceptions): NEVER run `git checkout`, `git restore`, `git reset`, `git clean`, `git stash` or
  `git revert`. Uncommitted work is the owner's; never discard it. Fix forward only — if a change was wrong, edit it
  back by hand. `git status` / `git diff` (read-only) are fine.
- Owner workflow on record: the owner commits after each green milestone on branch `wip/frontend-stage-b`; the agent
  never commits, and a task ends with the worktree intentionally dirty.
- Environment: Windows PowerShell 5.1 only — no `&&`, `head`/`tail`/`wc`/`grep`/heredocs. Use `;`, `Select-Object`,
  `Select-String`, `Measure-Object`. Run vitest ONLY from inside `apps/storefront` (or the package dir). Send long
  output to `$env:TEMP\*.txt` then filter it. No Python/Node rewrite scripts for bulk edits — small targeted edits only,
  with `npm --workspace storefront-app exec -- tsc -b` after each batch.
- Final output: findings first, concise, with counts; list deliberate omissions and surprises.

## 5. Storefront code conventions (learned the hard way)
- Shared UI only in packages/ui (`buttonStyles`, ui components). Never hand-rolled button/link class strings in apps
  (CartView still has some — known debt, being cleaned in B4-2a).
- No hard-coded business values/taxonomy/URLs/user-facing strings in components — named constants in NON-component
  files (oxlint react(only-export-components)).
- Every data component: loading/empty/error states, exactly ONE h1 per state. Titles = single template literal
  ``<title>{`${x} | ${siteConfig.name}`}</title>`` (multi-child title prerenders EMPTY; site name "TechFix").
- Route files thin, loader-free; data via TanStack Query, keys from app/hooks/query-keys.ts (cart key shared by
  header badge + cart page). Money math only app/lib/money.ts (integer minor units); server totals authoritative.
- Descriptions render as plain text (whitespace-pre-line, no innerHTML). Images only via asset.url / thumbnail_url.
- API calls only via api-client. Guarded routes via routes/require-auth.tsx (waits isSessionChecked).
- Stored/URL-derived routes/URLs pass isSafeInternalPath / isSafeApiUrl (packages/api-client/src/utils/safe-path.ts).
- Announcements through global Announcer (components/common/Announcer.tsx, always mounted). ProductDetail keeps its
  own always-mounted "Purchase options" role=status.

## 6. Test conventions
Vitest + RTL + MSW `onUnhandledRequest:"error"`; vitest testTimeout 10000, RTL asyncUtilTimeout 3000 (set once);
explicit vitest imports (no ambient globals — tsc -b typechecks tests). Fixtures/handlers in
apps/storefront/app/test/handlers.ts, per-test resets in setup.ts. `renderWithProviders(ui,{entry,state,withAnnouncer?})`
— announcer opt-in. DTL quirks: empty `<p role="status">` IS matched by queryByRole("status"); `<p role="status">Text</p>`
has an empty accessible name (use findByRole + toHaveTextContent, never {name}); `rerender` drops manual provider
wrappers; vitest ignores non-existent path args silently; probes mutating external objects must do it in useEffect;
SiteHeader is a NAMED export.

## 7. Backend conventions
Laravel modules server/app/Modules/*; controllers app/Http/Controllers/Api/V1; public routes individually
allow-listed in routes/api.php (named throttles: service-availability, shipping-fee). Business values live in
BusinessSetting rows (never constants; business_timezone = Asia/Karachi, times stored UTC). Money = 2-decimal
strings. Feature tests server/tests/Feature. Laravel paginator does NOT clamp out-of-range pages (MSW mirrors).
Validation errors = 422 with `errors` bag; stock/domain rejections = top-level `message` only.

## 8. Owner decisions on record (from phases.md)
- D1: guest wishlist heart -> login -> back to same page, NO replay (toggle-only API).
- D2: shipping fee shown at checkout from public GET /api/v1/shipping-fee (flat, same ShippingFeeService as orders).
- Booking times serialized UTC; frontend converts to business timezone (Asia/Karachi).
- V1 exclusions: specs table, ratings, FBT, warranty/trust boxes, service sidebar (confirmed owner).
- COD only, no payment step. Checkout/place-order/booking NEVER auto-replayed after login (restore + explicit confirm).
- Buy Now = add to cart then go to /checkout (engineering default, pending owner sign-off).
- Hosting deferred to Phase 13; composer.lock needs PHP >= 8.4.1 vs SRS "8.3" — resolve then.

## 9. KNOWN DEBT / BACKLOG (full list: phases.md Phase 12 checklist, 20 items)
- OrderService float arithmetic on money (fix Phase 12). CartView hand-rolled button classes (B4-2a cleanup).
- No cart hold countdown (deliberate V1 omission). Badge success variant contrast fail (Phase 12 #16).
- Admin app: scaffold + stub login only; no role guard (Stage C). Hosting + PHP version (Phase 13).
- Storefront flakes: register.test.tsx failed once 2026-10-20 full-parallel, not reproducible (324/324 green twice).
  B4-2a hit a REPRODUCIBLE full-parallel-only flake: new checkout tests clicked Placed-Order before the address
  selected (disabled click no-op) and a delayed POST cleared the shared cart mid-next-test. Fixed by waiting for
  enabled + letting the delayed request settle — do not reintroduce tight clicks.

## 10. Detail-route conventions (B4-2a)
- `/checkout` + `/account/orders/:id` are thin route wrappers (read `:id` param -> pass as prop). Views own queries,
  title, one h1. Both are CSR-only, behind require-auth, excluded from prerender.
- Double-submit guard = synchronous `useRef` (React Query `isPending` flips next render). Money shown from the
  server's own strings via `app/lib/money.ts` + `formatPrice`; never recomputed client-side.
- `DetailNotFound` (app/components/common/DetailNotFound.tsx) is the shared 404 with `<meta robots=noindex>` +
  breadcrumb + back action; used by ProductDetail/ServiceDetail/OrderDetailView. 404 handling via `app/lib/is-not-found.ts`.
- Checkout is COD-only and ALWAYS requires an explicit confirm click (never auto-replayed, per §8 / architecture §5.2).
- New MSW order/address handlers live in `app/test/handlers-checkout.ts` (never grow `app/test/handlers.ts`).

## 11. NEXT TASK
**B4-3 — Account area** (orders list, cancel, profile, saved addresses management). The engineering control chat will
paste the full task prompt. DO NOT START IT until that prompt arrives.
