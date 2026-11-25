# TechFix - OpenCode project instructions (single source of truth)
Rewritten 2026-11-20 (merged from CLAUDE.md, which is now only a pointer). If something here drifts from phases.md (the running log), phases.md wins. PRD.md and SRS.md (client spec) outrank everything.

## 1. Shell (Windows PowerShell 5.1 only)
- Never use grep, head, tail, cat, wc or sed as commands. No heredocs (<<). No && (it is a parse error in PowerShell 5.1). Chain with ';'.
- Use Select-String, Select-Object, Get-Content -Encoding UTF8 (and -TotalCount), Measure-Object, Out-File (temp logs only). Use cd to change directory.
- opencode.json denies those commands and the forbidden git commands. It matches command text, so ordinary words such as passed, location or header are fine.
- Send long output to $env:TEMP\*.txt, then filter it. Run vitest only from the owning package directory.

## 2. Background runs
- The tool timeout is 120 seconds. Run anything longer (full suites, builds, the verify script) as ONE background job and poll its output.
- Run the native command DIRECTLY inside the job: & cmd args 2>&1 | Out-File <log> -Encoding utf8, then read $LASTEXITCODE immediately and print it as EXIT=<n>. Start-Process with redirects loses the exit code; never put double quotes inside a Start-Process -ArgumentList.
- Never run two vitest processes at once (CPU contention makes tests fail). Check for other vitest processes first.
- Quote Windows paths that contain spaces.

## 3. Files, encoding, git
- Create and edit files with the Write/Edit tools. No rewrite one-liners on source files (-replace | Set-Content, Python or Node scripts).
- Read files with Get-Content -Encoding UTF8. Never write repo files with Set-Content/Out-File (the PowerShell 5.1 default encoding corrupts UTF-8). Keep new docs and scripts ASCII only.
- Git (absolute): never run git checkout, git restore, git reset, git clean, git stash or git revert. No commits unless the owner says so: the owner commits and pushes to GitHub, and a task ends with the worktree intentionally dirty. Uncommitted work is the owner's; never discard it, fix forward by editing it back by hand. git status, git diff, git log and git show are fine.
- Branch: wip/frontend-stage-b. Repo path: C:\dev\E-commerce (outside OneDrive, never move it back). Remote: origin on GitHub (private). The owner commits and pushes after each green milestone.

## 4. Working agreement (strict)
- Tests FIRST: write the test file before the implementation it covers, run it, SHOW the real RED output, then implement. Never claim a RED you did not observe; if implementation came first, say so.
- One task = one vertical slice; the frontend is built against the real server contract. Every task starts with a read-only STEP 0 report of real facts (quote the server code). A backend gap bigger than one small field or validation => STOP and report.
- Never claim green without the pasted summary line (Test Files, Tests, exit code). Never use --no-file-parallelism, retries, skipped tests or raised timeouts to get green. Report any failure with file + test + message.
- Mutation proofs only where the prompt marks [MUTATE]: one-shot, revert by hand, paste the real failure message ("conceptually fails" is not proof).
- Tests that assert an ABSENCE must first assert the thing was PRESENT (and wait for the populated state) so they cannot pass vacuously.
- Do not re-do verified work. Do not guess missing context: say UNKNOWN.
- Frontend VERIFY = full suites (storefront, api-client, ui) once each, one at a time, + tsc -b + storefront build + prerender check (every storefront task) + admin build (when ui or api-client changed) + check-built-css 9/9 for both + lint <= 10 warnings with zero new warnings from new files. Use scripts/verify-frontend.ps1 (section 5).
- Backend VERIFY = scoped new/changed tests + existing tests of touched code + Pint. Never run the full backend suite for a scoped task.

## 5. Commands (verified 2026-11-20)
- Dev ports: storefront 5173, admin 5174, API http://localhost:8000/api/v1.
- Test totals now: storefront 51 files / 488 tests, packages/api-client 18 / 265, packages/ui 30 / 243 (BK-0, 2026-11-23, all exit 0).
- apps/storefront/vitest.config.ts sets maxWorkers: 4 (owner decision, SUITE-1/2/3: without it the full suite failed 7 to 11 tests per run from CPU contention; with it 5 of 5 runs were clean at about 33-35 s). Do not remove or change it without an owner decision. Do not raise timeouts.
- Run suites with npx vitest run from apps/storefront, packages/api-client and packages/ui.
- Typecheck: delete apps/storefront/node_modules/.tmp/*.tsbuildinfo, then npm --workspace storefront-app exec -- tsc -b (exit 0).
- Builds: npm --workspace storefront-app run build; npm --workspace admin-app run build; then node scripts/check-built-css.mjs <css> on apps/storefront/build/client/assets/root-*.css and apps/admin/dist/assets/index-*.css (expect PASS 9/9 each).
- Lint: npm --workspace storefront-app run lint, then count the lines containing ': warning ' (baseline 10 warnings / 0 errors, never exceed).
- scripts/verify-frontend.ps1 [-Fast] [-SelfTest] runs tsc, the three suites, builds, prerender, css and lint and prints a status table; logs go to $env:TEMP\vf_*.txt. Run it as ONE background job. -Fast skips builds, prerender and css. -SelfTest checks the script's own parsing logic.
- Backend (Docker; host PHP is blocked for ext-gd by Smart App Control): cd infra/dev; docker compose run --rm api sh -lc "php artisan test <paths>"; Pint: docker compose run --rm api sh -lc "vendor/bin/pint <files>". The dev API for manual runs uses infra/dev/docker-compose.dev-serve.yml (port 8000). Never create a new ecommerce-dev_vendor volume.

## 6. Document hierarchy
PRD.md / SRS.md (client spec, primary; conflicts are REPORTED, never silently changed; never edit PRD.md) > architecture.md > rules.md > phases.md (running log: one dated entry per task, newest at the bottom, decisions as DECISION lines). Edit SRS.md or architecture.md only when behaviour or a contract actually changed. HANDOVER-2026-11-20.md is context for a new chat, not proof: check the repo first. docs/AUDIT-2026-11-19.md sections 6 (open items) and 9 (ranked risks) list the known problems as of 19 Nov.

## 7. Project
Pakistani tech store + doorstep IT-service booking platform for a real client (production standard). Two channels: COD-only product e-commerce and smart-scheduled doorstep IT bookings. Monorepo (npm workspaces):
  server/              Laravel 13 API (/api/v1); composer php ^8.3, dev runtime 8.5.x
  apps/storefront/     React Router v7 Framework Mode (SPA mode, ssr:false + prerender), Tailwind v4 [workspace storefront-app]
  apps/admin/          plain Vite CSR SPA, scaffold + stub login only [workspace admin-app]
  packages/ui/         shared design system (@ecommerce/ui) + tokens.css
  packages/api-client/ typed API client (@ecommerce/api-client)
  infra/dev/           docker compose for the backend test env (php:8.5-cli, sqlite :memory:)
  design-reference/    40 HTML/PNG prototype screens (visual target, gitignored)
  scripts/             verify-frontend.ps1, check-built-css.mjs
Storefront prerender set = /, /shop, /services, /login, /register + __spa-fallback.html ONLY (cart, checkout, wishlist and account/* are never prerendered).

## 8. Storefront code conventions
- Shared UI only in packages/ui (buttonStyles, Button, Input, Modal, Badge, Pagination, ErrorState...); ButtonVariant now includes danger. Never hand-rolled button or link class strings in apps (known debt: CartView, SiteHeader, ListingFilters).
- No hard-coded business values, taxonomy, URLs or user-facing strings in components: named constants in NON-component files (for example *-copy.ts).
- Every data component has loading, empty and error states and exactly ONE h1 per state. Titles are a single template literal: <title>{`${x} | ${siteConfig.name}`}</title> (a multi-child title prerenders EMPTY; site name "TechFix").
- Route files are thin and loader-free; data comes via TanStack Query with keys from app/hooks/query-keys.ts (the cart key is shared by the header badge and the cart page). Money math only in app/lib/money.ts (integer minor units); server totals are authoritative; formatPrice shows 2 decimals.
- Descriptions render as plain text (whitespace-pre-line, no innerHTML). Images only via asset.url / thumbnail_url.
- API calls only through packages/api-client. Guarded routes use routes/require-auth.tsx (it waits for isSessionChecked). The 401 helper is app/lib/handle-expired-session.ts.
- Stored or URL-derived routes and URLs must pass isSafeInternalPath / isSafeApiUrl (packages/api-client/src/utils/safe-path.ts).
- Announcements go through the global Announcer (components/common/Announcer.tsx, always mounted). ProductDetail keeps its own always-mounted "Purchase options" role=status.
- Detail routes: /checkout and /account/orders/:id are thin wrappers that pass :id as a prop; the views own queries, title and the single h1; both are CSR-only, behind require-auth and not prerendered. The double-submit guard is a synchronous useRef. DetailNotFound (app/components/common/DetailNotFound.tsx) is the shared 404 (noindex, breadcrumb, back action); 404 detection lives in app/lib/is-not-found.ts.
- MSW handlers go in new files (handlers-checkout.ts, handlers-wishlist.ts, handlers-account.ts); never grow app/test/handlers.ts.

## 9. Test conventions
Vitest + React Testing Library + MSW with onUnhandledRequest:"error"; testTimeout 10000 and RTL asyncUtilTimeout 3000 are set once (do not raise them). Explicit vitest imports (no ambient globals; tsc -b typechecks tests). Fixtures and handlers live in apps/storefront/app/test/handlers*.ts, per-test resets in setup.ts. renderWithProviders(ui, {entry, state, withAnnouncer?}) - the announcer is opt-in.
Known DTL quirks: an empty <p role="status"> IS matched by queryByRole("status"); <p role="status">Text</p> has an empty accessible name (use findByRole + toHaveTextContent, never {name}); rerender drops manual provider wrappers; vitest silently ignores non-existent path arguments; probes that mutate external objects must do it in useEffect; SiteHeader is a NAMED export; the loading state renders an sr-only h1, so wait for the populated heading before asserting absence.
Tests are load-sensitive: under heavy CPU load they run 3 to 5 times slower (tracked debt). Click only after the control is enabled, and let delayed requests settle before the next test (a delayed POST once cleared the shared cart mid-test).

## 10. Backend conventions
Laravel modules live in server/app/Modules/*; controllers in app/Http/Controllers/Api/V1; public routes are individually allow-listed in routes/api.php (named throttles: service-availability, shipping-fee). Business values live in BusinessSetting rows, never constants (business_timezone = Asia/Karachi, times stored UTC). Money = 2-decimal strings. Feature tests live in server/tests/Feature. The Laravel paginator does NOT clamp out-of-range pages (MSW mirrors this); per_page is capped to 1..48 by PerPage::fromRequest. Validation errors are 422 with an errors bag; stock and domain rejections are a top-level message only.

## 11. Owner decisions on record
- D1: a guest's wishlist heart goes to /login and back to the same page, NO replay (toggle-only API). D2: the shipping fee is shown at checkout from the public GET /api/v1/shipping-fee.
- COD only, no payment step. Checkout, place-order and booking are NEVER auto-replayed after login (restore the route and require an explicit confirm). Buy Now = add to cart, then go to /checkout (engineering default, owner sign-off pending).
- Booking times are stored UTC and converted to Asia/Karachi in the frontend; the booking cancel cutoff (2 hours) comes from the server/setting, never hard-coded.
- Set-default address only via POST /addresses/{id}/default; address forms never send is_default. A password change signs out OTHER devices and keeps the current one signed in.
- V1 exclusions (confirmed): specs table, ratings, FBT, warranty/trust boxes, service sidebar, guest checkout, online payment.
- Order of work: finish Stage B (storefront), then Stage C (admin), then demo data. Every task has real-situation unit and integration tests.
- Hosting is deferred to Phase 13; composer.lock needs PHP >= 8.4.1 while PRD/SRS say 8.3 and the owner targets 8.5.12 (resolve then; PRD is never edited).
- Open: refund policy (PRD item 16, client), and whether /our-brands is needed.
- Customer reschedule = real endpoint (BE7: atomic new-slot booking + cancel old + `rescheduled_from_id`, same 2h cutoff and overlap rules).
- Serviceable areas = `BusinessSetting` JSON city list + address city validation on booking create (BE8).
- Booking photo = V1 but after the wizard exists (BE9).
- A holiday cannot be created on a date that still has active (pending/confirmed/technician_on_the_way) bookings; admin must reschedule them first (with a reason note), then the day can be blocked. Enforced in the backend (BE7), plus admin UI shows the list of bookings for that date (Stage C).

## 12. Known debt and current queue
- Phase 12 hardening: 13 of 21 items are open (see the checklist in phases.md); #14 (password sign-out) is resolved by PW-PROOF-3 (scripts/pw-proof.ps1, two cookie jars, mutations); item 21 tracks the residual no-stored-hash window.
- OrderService float money (fix in Phase 12); Badge success contrast; hand-rolled button classes in CartView, SiteHeader and ListingFilters; hard-coded strings in config/site.ts; ShippingFeeService default 200; the admin app has no role guard (Stage C); the repo was moved out of OneDrive to C:\dev\E-commerce on 2026-11-20 (REPO-MOVE done).
- /account/addresses is built (B4-3b-3, 2026-11-20): list/add/edit/delete/set-default behind require-auth; hub link and its two assertions in account._index.test.tsx remain.
- profile.flow once failed with 'Ada UpdatedAda Updated' under load (0 of 15 reproduced; UNPROVEN, parked).
- Holiday request `validationData()` override reads raw JSON (TrimStrings bypass) and does not cover form-encoded bodies (TRACKED).
- Queue (the owner sets the order per task): BK-0c done -> MSW/type fidelity fix -> BE7 reschedule + holiday-block rule -> BE8 -> BE9 -> B5 booking UI -> B6 / B6b / B7 -> Stage C admin -> Phase 12 -> Phase 13.

## 13. Language and reports
Write everything (code comments, notes, reports) in plain English. Never translate or reword command output; every count in a report must come from a command you ran. Final report order: A Result (3 lines), B What I did ("I did X because Y; proof: Z"), C Evidence (exact command + pasted output; PROVEN / UNPROVEN / UNKNOWN), D Files changed, E Not done / skipped / surprises, F Questions or risks for the owner, G State after (git count with group counts, "no commit made"). Findings first, concise; list deliberate omissions and surprises.
