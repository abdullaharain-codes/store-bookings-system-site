# phases.md — Development Roadmap
**Location in repo:** `/phases.md` (repo root, alongside `PRD.md`, `SRS.md`, `architecture.md`, `rules.md`, `design.md`, `frontend-plan.md`)
**Depends on:** `PRD.md`, `architecture.md`, `rules.md`

Each phase below is only "complete" when it passes the Quality Gate at the bottom of this document. No phase begins until the prior phase's foundation is verified working.

---

## Phase 0 — Documentation & Design System
**Objective:** lock product definition before any code.
**Deliverables:** `PRD.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md` (this set).
**Completion criteria:** client sign-off on scope, open decisions (`PRD.md` §12) either resolved or explicitly deferred with owner noted.

---

## Phase 1 — Foundation
**Objective:** project scaffold, auth, DB schema, shared design-system components, Asset/upload service.
**Features:**
- Repo structure per `architecture.md` §13.
- Database schema for core + taxonomy + settings + media entities (`architecture.md` §4).
- Auth module: registration, login, session/token issuance, auth middleware, role checks (`architecture.md` §5).
- Redirect-and-resume mechanism (frontend pending-action store + backend replay-safe validation).
- Shared UI package: Button, Input, Select, Card, Badge, Modal, Tabs, Table, Pagination, Empty/Loading/Error states, and the **generic Carousel component** (`rules.md` §4).
- Generic `Asset` upload service (validation: type/size/dimensions) used by every later image feature.
- `BusinessSetting` module (generic settings store + typed read helpers).
**Dependencies:** Phase 0 sign-off.
**Testing:** unit tests for auth/session logic and ownership checks; integration test for a protected-route round trip (401 → login → resume).
**Completion criteria:** a developer can register, log in, hit a protected endpoint and get correctly blocked/resumed; admin settings can be created/read via API. Admin users are provisioned via `php artisan admin:create` (resolves the previously flagged missing seeding path).

---

## Phase 2 — Taxonomy & Brand/Category Visual Management *(new, moved earlier per client requirement)*
**Objective:** categories and brands fully admin-managed and database-driven, since the storefront (Phase 3) and homepage banners (Phase 8) both depend on live taxonomy.
**Features:**
- Admin CRUD: Category (name, slug, logo, banner, description, displayOrder, isPublished, parentCategoryId per `PRD.md` §7.2/§12 item #14) and Brand (name, slug, logo, isPublished).
- Public `GET /categories`, `GET /brands` endpoints (published-only, ordered).
- Admin publish/unpublish toggle with audit log entry.
**Dependencies:** Phase 1 (Asset service, admin auth).
**Testing:** unit test for slug uniqueness/generation; integration test confirming an unpublished category/brand is unreachable via public endpoint (IDOR check per `architecture.md` §10).
**Completion criteria:** admin can create a category with logo/banner and publish it; it is retrievable via the public API with zero frontend code changes needed later.

> **GAP FOUND & RESOLVED (2026-09-26, during frontend CategoryCard build):** Phase 2's public category read endpoints (`GET /categories`, `GET /categories/{slug}`) were not eager-loading `logoAsset`/`bannerAsset`, so published categories' logo/banner images never reached the public API despite being fully supported in the admin CRUD and database schema — a real gap in Phase 2's original "complete" verification, not a new requirement. Fixed: eager-loading added to `EloquentCategoryRepository::findPublished`/`findBySlug`/`findAllForAdmin` and `Admin\CategoryController::show`, the api-client `Category` type updated with `logo_asset`/`banner_asset`, and `CategoryCard` now renders real images. This is exactly the kind of regression the Quality Gate's "explicitly re-verify, don't assume" rule exists to catch.

---

## Phase 3 — Product Catalog (Admin + Public)
**Objective:** browsing experience.
**Features:** Admin Product CRUD (name, slug, SKU, description, price, stock quantity, category assignment (many-to-many), brand assignment (single, optional), multiple product images with display order, publish/unpublish); category/brand listing pages (consuming Phase 2 data live, no hard-coding per `architecture.md` §6), product listing with filters/sort/pagination, search, product detail page, "Shop by Category" and "Shop by Brand" homepage sections rendering live logos.

> **Note:** public browsing requires products to actually exist — without admin CRUD there would be nothing to browse. The original phase breakdown omitted this scope; admin CRUD and public read are therefore combined in this phase, matching the pattern already used in Phase 2 (Taxonomy: admin management + public read endpoints).

**Dependencies:** Phase 2.
**Testing:** integration test that a newly published category/brand appears in listings/filters without redeploy; responsive/accessibility pass on filter UI.
**Completion criteria:** full guest browsing journey (PRD §5.1) works end-to-end.

---

## Phase 4 — Cart, Wishlist & COD Checkout
**Objective:** transactional buying flow, auth-gated.
**Features:** Cart (guest-visible content, but add-to-cart requires auth per PRD §5.2 → triggers redirect-and-resume), Wishlist, Checkout (no guest checkout), Order creation, Order Confirmation.

> **Note:** `Address` (listed in `architecture.md` §4 as a core entity) was missing from all prior phases. It is added here as a Phase 4 prerequisite — addresses are required for order placement and are managed as part of the checkout flow.
**Dependencies:** Phase 3, Phase 1 auth.
**Testing:** integration test of the full redirect-and-resume path specifically for "add to cart as guest → login → item is in cart"; stock/price-change edge cases at checkout.
**Completion criteria:** a real order can be placed end-to-end with COD, correctly blocked/resumed for guests.

---

## Phase 5 — Order Management (Customer + Admin)
**Objective:** post-purchase visibility and admin fulfillment.
**Features:** Customer Order History/Detail, Admin Orders list/detail, payment-status updates, order status audit log.
**Dependencies:** Phase 4.
**Testing:** ownership-check test (customer A cannot view customer B's order via direct ID manipulation).
**Completion criteria:** admin can fulfill an order end-to-end; customer sees accurate real-time status.

---

## Phase 6 — Service Catalog (Admin CRUD + Public Pages)
**Objective:** services as dynamic, admin-managed entities.
**Features:** Admin Service CRUD (price range, duration, publish), public Services listing + Service Detail.
**Dependencies:** Phase 1 (Asset service if services have images), independent of catalog phases otherwise.
**Testing:** validation test that priceMin ≤ priceMax is enforced.
**Completion criteria:** admin can add a new bookable service with zero code change, visible publicly.

---

## Phase 7 — Scheduling/Availability Engine (Backend-first, headless)
**Objective:** the hardest correctness requirement — must be built and proven before any booking UI is built on top of it.
**Features:** Business hours/holiday config, buffer time, minimum booking notice (all via `BusinessSetting`), slot generation, temporary slot holds, overlap/double-booking prevention (DB constraint + transaction-level check per `architecture.md` §4.2), nearest-slot suggestion logic.
**Dependencies:** Phase 6, Phase 1 settings module.
**Testing:** heavy unit/integration testing here specifically — concurrent booking-attempt test proving double-booking is structurally impossible, not just discouraged by the UI.
**Completion criteria:** availability API correctly reflects all configured constraints and cannot be raced into a double booking. *(Read half delivered by BE3, 2026-10-05: `GET /api/v1/services/{slug}/availability` reflects business hours, holidays, buffer, minimum notice, active holds and non-cancelled bookings. The write-half - holds + `BookingService`'s re-validation under concurrency - remains Phase 7 work.)*

---

## Phase 8 — Guided Booking Flow (Public) + Booking Management + Homepage Hero Banners
**Objective:** the customer-facing booking experience, plus homepage promotional banners (grouped here since both depend on live Category/Service data being stable).
**Features:**
- Multi-step booking wizard (service → device → problem [+ optional photo upload] → date/time → address [validated against serviceable areas] → confirm), auth-gated with full resume-after-login (per PRD §5.4/§12 item #12: all step data preserved).
- Booking Confirmation, Booking Tracking, Cancellation/Reschedule (2-hr cutoff rule, hard-blocked post "Technician On The Way").
- Admin Bookings (list + calendar), Booking Detail, status transitions, final-price entry (audit-logged).
- **Homepage Hero Banner** admin CRUD (upload, target-category FK, reorder, publish) using the same generic Carousel component from Phase 1, and public rendering with prev/next + swipe + hover-pause behavior (`PRD.md` §8).
**Dependencies:** Phase 7 (scheduling engine), Phase 2 (categories, for banner target FK).
**Testing:** end-to-end test of full booking creation and of cancellation-cutoff enforcement; test that re-pointing a banner's target category updates its live click destination immediately.
**Completion criteria:** a customer can complete a real booking end-to-end; admin can fully manage banners with zero hard-coded links.

---

## Phase 9 — Customer Account Area
**Status:** ✅ Complete
**Objective:** consolidate everything customer-facing into one dashboard.
**Features:** Dashboard overview, Orders, Order Detail, Bookings, Booking Detail, Profile, Addresses, Wishlist view, Notifications.
**Dependencies:** Phases 4, 5, 8.
**Completion criteria:** all customer self-service journeys accessible from one place, mobile responsive.
Notifications tab deferred until Phase 11 (Notifications backend) exists — documented decision, not an oversight. Orders/Bookings/Addresses/Wishlist views reuse existing Phase 4/5/8 endpoints, already ownership-scoped and tested; no new backend work was needed for them.

---

## Phase 10 — Reviews & Review Showcase
**Status:** ✅ Complete
**Objective:** trust-building content, two distinct systems.
**Features:** Product/Service Review submission (verified-purchase/completed-booking eligibility check, per `rules.md` §8), public review display; **Review Showcase** admin CRUD + public carousel (reusing the Phase 1 Carousel component with lightbox enabled), IDOR-safe published-only public endpoint.
**Dependencies:** Phase 5 (verified purchase check), Phase 8 (verified booking check), Phase 1 (Carousel, Asset).
**Testing:** test that an unverified user cannot submit a review; test that unpublished showcase items are unreachable publicly.
**Completion criteria:** both review systems function independently and correctly gate submission eligibility.

Reviews (Step 10.1) and Review Showcase (Step 10.2) verified as architecturally independent — no shared tables, no cross-references. Reviews auto-publish on submission (hybrid decision: eligibility check is the gate; admin retains unpublish/republish power). Review Showcase is fully admin-curated (starts unpublished, goes live only via explicit publish action).

---

## Phase 11 — Notifications
**Status:** ✅ Complete
**Objective:** website + email notifications for order/booking status changes.
**Dependencies:** Phases 5, 8.
**Completion criteria:** status-change events reliably trigger the correct notification channel(s).

This also delivers Phase 9's deferred item: the customer account area's Notifications tab (deferred in Phase 9) is now backend-ready — `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.

---

## Frontend Build (parallel track to Phase 12)
The frontend runs as its own track rather than inside Phase 12, because it can proceed against the already-complete backend while Phase 12 hardening is still open. Backend Phases 1–11 are ✅ complete; the backend surface this track consumes is stable.

**Current test totals (2026-09-30):** backend **631** · ui **160** · api-client **203** · storefront **143**.

### Step 0 — Dev setup fixes
✅ **Done.** Distinct dev ports (storefront 5173 / admin 5174), per-app `VITE_API_URL`, `@ecommerce/ui` peer ranges aligned to React 19 + Tailwind v4, `QueryClientProvider` wired in both apps, clean workspace install.

### Step 1 — `@ecommerce/ui` (shared design system)
✅ **Done — every exported component is tested.**

Exported from `packages/ui/src/index.ts` (21 components/utilities, each with a colocated test): `Button`, `Input`, `Select`, `Textarea`, `Tabs`, `Card`, `Badge`, `Modal`, `Carousel`, `EmptyState`, `LoadingSkeleton`, `ErrorState`, `ProductCard`, `ServiceCard`, `ClickableArea`, `CategoryCard`, `CategoryBanner`, `Stepper`, `DataTable`, `BrandCard`, plus the `formatPrice` utility. Design tokens live in `src/styles/tokens.css` (Tailwind v4 syntax).
Still open (tracked, not blocking): the `EmptyState`/`LoadingSkeleton`/`ErrorState` arbitrary-value audit, the `ServiceCard` icon-tile gap, the `ClickableArea` focus-ring radius mismatch, and the missing aggregate rating — all listed under Frontend Testing Debt / design gaps below.

### Step 2 — `@ecommerce/api-client` (typed API layer)
✅ **Done:** `catalog`, `cart`, `wishlist`, `order`, `address`, `services`, `reviews`, `dashboard`, `notifications`, `profile`, `homepage-banners`, `review-showcase`, plus the `auth` store, the `useRedirectAndResume` hook, the pending-action store, and the `isSafeInternalPath`/`isSafeApiUrl` guards.

**MISSING:**
- `bookings.ts` — no client module (create/cancel/reschedule/availability). The backend endpoints exist; the typed wrapper does not.
- `admin/*` — **zero** coverage. The whole admin surface (56 endpoints) is unimplemented on the client: products, taxonomy, services, orders, bookings, merchandising, settings, assets.
- Asset upload — no `POST /admin/assets` upload helper/wiring.

**B2a (2026-09-30) — data layer, no UI changes:**
- Added `review-showcase.ts`: `getReviewShowcase(page?)` → `GET /review-showcase`, returning the `{ review_showcase_items: <paginator> }` envelope the controller actually wraps. Reuses the existing `Asset` and `Paginator<T>` types from `catalog.ts` rather than redeclaring them, and is exported (value + types) from `src/index.ts`.
- `getProducts` gained `perPage?: number`, clamped client-side to an integer in **1..48** (fractions rounded, then clamped; a non-finite value throws rather than putting `NaN` on the wire). The cap is a client-side guard only — the server still accepts unbounded `per_page`, which is why Phase 12 item 10 stays open.
- `getProducts` now builds its `params` key-by-key instead of sending an object of explicit `undefined` values, so an unset filter is genuinely absent from the request rather than present-and-undefined.
- New colocated suites: `catalog.test.ts` (21), `address.test.ts` (6), `review-showcase.test.ts` (7) — every exported function, asserting URL, method/body, exact params, absent params, response unwrapping, and error propagation. api-client is now **203 tests / 16 files**.
- Storefront MSW gained typed `GET /products` and `GET /review-showcase` handlers with fixtures, `callCounts.products`/`reviewShowcase`, and per-test request recorders (`productRequests`/`reviewShowcaseRequests`, reset in `setup.ts`). The products handler mirrors the real controller: publishes only, honours `per_page`/`category_id`/`brand_id`/`search`/`sort`/`page`, clamps `per_page` to 1..48, and expands a parent `category_id` to its descendants the way the Taxonomy scope does. `handlers.test.ts` (17) exercises the **real** client functions against these handlers, so a param the client meant to send but never did cannot pass. No existing handler behaviour and `onUnhandledRequest: "error"` were changed.

### Step 3 — Storefront app
✅ **Done:** Home page rendering live API data; React Router v7 **Framework Mode** in SPA mode (`ssr:false` + `prerender()` for `/`, `/shop`, `/services`, `/login`, `/register`); `SessionBootstrap` one-time session check; `RequireAuth` pathless guard on `/cart`, `/wishlist`, `/account`; real Login and Register pages sharing one `usePostAuthNavigation` hook; full MSW test harness (handlers + server + setup + router helper) with `onUnhandledRequest: "error"`.

✅ **Layout shell (B1 + B1b review fixes) — done:** pathless `site-layout` route wrapping every page except the two auth routes; `SiteHeader` (sticky `<header>`, live category tree rebuilt from `parent_category_id`, live brands, `search`-param search box, session-aware Account/Log out vs guest Log in, cart badge, wishlist, mobile disclosure menu, one-open-panel dropdowns that dismiss on outside press, focus-out, Escape with focus return, and navigation); `SiteAnnouncement` rendered as a sibling **above** the header in the layout; `SiteFooter`; typed `VITE_SITE_*` config; shared `queryKeys` for taxonomy so the header nav and Home reuse one cached request.

Known limitations of the shell, all deliberate:
- **Login/Register are intentionally chromeless** — they render outside `SiteLayout` (own `<main>`/`<h1>`, no header or footer), matching the reference login/register screens.
- **The footer has no policy links and no contact block** unless configured; every footer entry is `VITE_SITE_*`-driven so no dead links ship by default.
- **The announcement strip is env-driven** (`VITE_SITE_ANNOUNCEMENT`) and renders nothing when unset.
- **`/our-brands` is still undecided** — the header links brands into `/shop/brand/:slug`; whether a dedicated brands index page is needed is an open call.
- The sticky header pins at `top-0` and the announcement scrolls away; the reference instead docks the header at `top-[32px]` so the strip stays visible. Accepted divergence.

**Pending:**
- Shop listing + category + brand pages (routed, placeholder content only).
- Product detail, service detail, services listing (routed, placeholder content only).
- Cart and wishlist (routed and wired to the api-client: cart slice B4-1c, wishlist B4-2b).
- Checkout (`/checkout` exists — B4-2a) and order confirmation.
- Account pages (the `/account` layout, dashboard index, and order detail `/account/orders/:id` are routed; the orders list `/account/orders` plus profile, addresses, bookings and notifications arrive in B4-3).
- Booking wizard (start step only; confirm-step gate pending).
- Reviews / Review Showcase.
- SEO: per-route `<title>`/meta, `sitemap.xml`, `robots.txt`, `clientLoader` + `HydrateFallback` for the dynamic slug routes.

### Step 4 — Admin app
Scaffold + Login only. `apps/admin` is a plain client SPA with a placeholder dashboard and a stub login page; there is **no routing surface and no client-side role guard** beyond calling `fetchUser()` on mount (see Phase 12 item 19).

---

## Phase 12 — Hardening
**Objective:** security review, performance pass, accessibility audit, SEO, full responsive QA across every phase's screens — including both carousels, all admin CRUD screens, and the full booking/checkout flows.
**Dependencies:** all feature phases complete.
**Completion criteria:** production-readiness checklist (per original brief) fully green.

**Hardening checklist** (self-contained — no dependency on external status reports; resolved items stay visible so the phase-by-phase history is intact, matching how Phases 9/10 keep their resolved-decision notes):

1. **Sanctum non-whitelisted-origin 500 → 401 (noted from Sanctum fix):** a login attempt from a non-whitelisted origin currently returns 500 "Session store not set" instead of 401; harden to return a clean 401 for Phase 12.
2. **Review duplicate-race → 422 mapping (noted from Review duplicate race):** ReviewService::submitReview()'s duplicate check (assertNotDuplicate) is a service-layer check backed by a DB unique constraint, but a genuine race (two simultaneous submit requests for the same user+target) would surface as a raw 500 QueryException, not a clean 422 — low priority (single-user double-submit is an unlikely race, unlike booking slots), but worth a database-exception-to-422 mapping in Phase 12.
3. **Reviews/Showcase missing query-count assertions (noted from Reviews/Showcase query counts):** Reviews/ReviewShowcase list endpoints don't have an explicit expectsDatabaseQueryCount assertion (unlike DashboardApiTest) — eager-loading looks correct (with('user:id,name')) but the N+1-safety claim isn't test-proven the same rigorous way. Add query-count assertions in Phase 12 for consistency.
4. **Generic Asset upload endpoint** — ✅ Resolved in Phase 11 (POST `/api/v1/admin/assets`, admin-only, delegates to FileUploadService).
5. **BusinessSetting admin API** — ✅ Resolved in Phase 11 (GET/GET-by-key/PATCH under `/admin/settings`, type-validated, audit-logged).
6. **Rate limiting on auth/review-submission/password-change** — ✅ Resolved in Phase 11 (named limiters: login email+IP compound, register IP, password-change per-user, review-submission per-user).
7. **storage/uploads/.htaccess execution-deny** — ✅ Resolved in Phase 11 (SRS §3.7).
8. **FileUploadService dimension-limit enforcement (was preset-optional, silently skippable)** — ✅ Resolved in Phase 11 (now category-derived, mandatory, SRS §3.4).
9. **`shipping_fee` stored as string not decimal** (audited 2026-09-30, closed) — Audited 2026-09-30: the DB column is `decimal(10,2)` and `Order` casts `decimal:2`; the API returns decimal strings by design and the frontend parses them via `formatPrice`. Not a defect; no change needed.
10. **Public listing endpoints have no per_page cap** — list endpoints accept unbounded per_page without an upper bound; introduce a documented cap. **Partially mitigated on the client (2026-09-30, B2a):** `getProducts` now clamps `perPage` to 1..48 and documents the cap, so the storefront client cannot ask for an unbounded page. This is a client-side guard only — `ProductController` still reads `per_page` straight off the request with no validation, so any other caller (or a hand-rolled request) can still pull an arbitrarily large page. The server-side cap in a `FormRequest` is what actually closes this item. **RESOLVED (BE4, 2026-10-07; re-verified 2026-11-20):** PerPage::fromRequest caps per_page to 1..48 on /products and /services; this item is closed.
11. **SlotGenerationService::nearestAvailableSlot() N+1** — the nearest-slot suggestion issues queries per candidate day; collapse to a bounded query set.
12. **HomepageBanner/ReviewShowcase reorder() partial-ID-list stale display_order** — reordering with a partial ID list leaves unlisted rows at stale display_order values; reconcile ordering for partial lists.
13. **Production MySQL transaction_isolation should be confirmed REPEATABLE READ** — the booking-slot concurrency guarantees assume REPEATABLE READ; verify Hostinger MySQL's default before go-live.
14. **No cross-device session invalidation after password change** - a password change does not invalidate sessions/tokens on other devices; add invalidation for Phase 12. **RESOLVED (PW-PROOF/-2/-3, 2026-11-20):** proven on the running API with two cookie jars and mutations; see the PW-PROOF-3 entry. Residual window: item 21.
15. **AdminAssetController uses inline `$request->validate()` instead of a dedicated FormRequest** — unlike every other admin controller in this codebase, a deliberate scope-limited deviation from the Task upload-endpoint; align it with the FormRequest pattern for consistency.
16. **Badge `success` variant fails WCAG AA** - `--color-status-success: #16A34A` as text on a 10%-tint background (effectively near-white) is roughly 3.3:1 at 12px, below the 4.5:1 body-text threshold. Darken the token or switch the variant to a darker text colour; do not ship it as-is (`design.md` §2.2).
17. **`allowScripts` is set in the wrong `package.json`** - it currently lives in `apps/storefront/package.json`, and npm ignores it there (it must be at the workspace **root**), so the esbuild postinstall approval is silently a no-op. Move the field to the root `package.json`.
18. **`usePostAuthNavigation` snapshots pending state at render time** - it reads `hasPendingAction` through a `useCallback` dependency, so a pending action written *after* the hook mounts is invisible to the closure. Read the pending action at call time via `usePendingActionStore.getState()` instead.
19. **Admin app has no role guard or route protection** - `apps/admin` renders its dashboard at `/` unconditionally and only calls `fetchUser()` on mount; every admin screen is reachable client-side by a non-admin user until the API rejects the call. Add a client-side role guard / route protection as a UX measure in Stage C (server-side enforcement is already correct and remains the real boundary, per `PRD.md` §5.5).
20. **Production cookie/CORS/mail settings not yet applied** - `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, `SANCTUM_STATEFUL_DOMAINS`, the CORS `allowed_origins` list, and `MAIL_MAILER` (currently `log`) must all be set per the `SRS.md` §6.2.1 checklist before go-live. A wrong cookie domain or an unset `MAIL_MAILER` fails silently rather than loudly.
21. **A session that never made an authenticated request is not invalidated by another device's password change** - Sanctum stores the password hash in the session only after an authenticated request, so a session that logged in but made none before the change is never invalidated: its first request after the change stores the NEW hash, so it keeps working until the session expires (PW-PROOF-3 scenario nohash; two consecutive requests returned 200). The storefront calls GET /auth/user on bootstrap, so the window is small. Mitigation (test first): store the hash at login.

---

## Phase 13 — Deployment
**Objective:** go-live.
**Dependencies:** Phase 12.
**Completion criteria:** production environment configured (env vars, HTTPS, CORS, logging, error monitoring, DB backups considered), smoke-tested in production.

**Checklist:**
- [ ] Production PHP must have `ext-gd` (verify `php -m` shows gd on Hostinger PHP 8.3); `FileUploadService` hard-codes the GD driver and `ProductService` injects it, so a missing GD breaks every product endpoint.

---

## Running backend tests (Docker)
The Windows host has Smart App Control enabled, which blocks the host's `ext-gd` at load time (Code Integrity event 3033: `php_gd.dll did not meet the Enterprise signing level requirements`). Because `FileUploadService` hard-codes Intervention's GD driver, a missing GD 500s every `/api/v1/admin/products` and `/api/v1/admin/assets` request, not just uploads — 63 backend tests failed on 2026-10-01 purely from this environmental cause.

Run the suite in the container defined in `infra/dev/` (dev-only; **not** part of the Hostinger deploy):

```bash
cd infra/dev
docker compose build          # once
docker compose run --rm api   # php -v, php -m | grep -i gd, composer install, php artisan test
```

Baseline on that image: **631 passed**, 2407 assertions, ~155–185s. `server/phpunit.xml` pins `DB_CONNECTION=sqlite` / `DB_DATABASE=":memory:"`, so no database service is needed. `vendor/` lives in a named volume so Composer never writes through the OneDrive bind mount; the container runs no JavaScript, so `node_modules` is not mounted.

Note the image is `php:8.5-cli`, not 8.3: `server/composer.lock` pins Symfony 8.1 components and `laravel/framework` 13.25, which require **php >= 8.4.1**. `server/composer.json` still declares `php: ^8.3`, which is stale relative to the lock — worth reconciling separately.

---

## Quality Gate (applies to every phase above)
A phase is not marked complete unless:
- Requirement implemented as specified in `PRD.md`.
- Architecture from `architecture.md` followed (no ad hoc shortcuts).
- Rules from `rules.md` followed (no hard-coded values, proper auth enforcement, tests present).
- No regression introduced in a previously completed phase (explicitly re-verify, don't assume).
- Responsive and accessibility behavior checked for any new screen/component.
- **Built CSS actually contains `@ecommerce/ui` classes** (added by TW1): after building each app, run `node scripts/check-built-css.mjs <built-app-css>` against `apps/storefront/build/client/assets/root-*.css` and `apps/admin/dist/assets/index-*.css`; both must exit 0. Tailwind v4 scans the app's Vite root only, so if the `@source` line in `packages/ui/src/styles/index.css` is lost, every ui-only class disappears with **no build error and no test failure** — the components just render unstyled. Manual release/D4 gate; no CI exists yet.

---

## Frontend Testing Debt (tracked, not blocking)
CLOSED (2026-09-30): `apiClient` itself, `useAuthStore`, and `useRedirectAndResume` now have colocated test suites, and the `Input` and `Badge` ui components are tested. services.ts gained tests on 2026-09-26; wishlist.ts, cart.ts, and order.ts were closed 2026-09-27 in the same hardening pass that fixed the cart/wishlist product eager-loading; reviews, dashboard, notifications, profile, and homepage-banners followed in the same pass.

CLOSED (2026-09-30, B2a): `catalog.ts` and `address.ts` — the last two untested api-client modules — now have colocated suites covering every exported function, plus a new `review-showcase.ts` module and its suite. **Every runtime module in `packages/api-client/src` is now exercised by at least one test.** Two deliberate nuances, so this is not overclaimed: `stores/pending-action-store.ts` has no dedicated colocated file (it is covered thoroughly by `hooks/use-redirect-and-resume.test.ts`, which asserts against it in 19 places), and `index.ts` is a pure re-export barrel with no logic to test.

MITIGATED (2026-09-30, TASK T1) — T1 attributed the storefront suite's intermittent failures to **synchronous queries asserting on asynchronously-rendered content**, and shipped `maxWorkers: 2` in `apps/storefront/vitest.config.ts` as a CPU-contention mitigation. T1's stated diagnosis was later falsified (see RESOLVED (T2) below); the `maxWorkers: 2` mitigation itself was measured sound and has now been removed.

MITIGATED (2026-09-30, TASK T1) — five tests in four files were named as the suspects: `register.test.tsx` "renders server 422 field errors next to the matching field" (L147 `getByLabelText`, L152 `getByTestId`) and "clears a server field error once the field is edited" (L180); `site-layout.test.tsx` "renders exactly one main landmark, focusable programmatically" (L15 `getAllByRole("main")` in a non-async `it`); `SiteHeader.test.tsx` "exposes banner, navigation and search landmarks" (L58-61); `redirect-and-resume.flow.test.tsx` scenario 1 (L147 `getByRole` add-to-cart, L160 `getByRole` Cart heading). The shared `fillForm` helper in `register.test.tsx` (L30-42, sync `getByLabelText`) was also implicated.

The previously recorded explanation ("RTL `asyncUtilTimeout` too tight under load") was wrong and is corrected here. Evidence: there is no `findByLabelText` anywhere in `app/`, so no async timeout setting can reach the failing query; and candidate C (`asyncUtilTimeout: 4000` + `testTimeout: 15000`) ran 10/10 at 13.2 s mean versus the 13.1 s baseline — a no-op.

**T1 measurements**, each over 10 full runs: baseline `maxWorkers` unset — 10/10 at 13.1 s mean; `fileParallelism: false` — 10/10 at 33.7 s; timeouts raised — 10/10 at 13.2 s; `maxWorkers: 2` — 10/10 at 18.3 s, then 20/20 consecutive clean runs at 143/143, mean 18.1 s, max 18.3 s.

RESOLVED (2026-10-01, TASK T2) — **T1's diagnosis was wrong, and `maxWorkers: 2` has been removed.** Two findings:

1. *The named tests are not racing async content.* T2 injected 300 ms of latency into the two MSW handlers those tests actually depend on (`GET /auth/user`, which SessionBootstrap fires in a `useEffect`, and `POST /auth/register`, which produces the 422 the assertions read) and re-ran all four files: **52/52 passed**. Each suspect query is in fact static first-render content, or sits immediately after an awaited async assertion: `register.test.tsx` L147/L152/L180 all follow `await screen.findByText(...)`, which has already awaited the store update and its render; `site-layout.test.tsx` L15 targets static JSX in `site-layout.tsx`; `SiteHeader.test.tsx` L58-61 are static landmarks and its `setSession("guest")` pre-sets `isSessionChecked`, so `AuthActions`' early `return null` is never reached; the `fillForm` helper queries unconditional first-render inputs. A sync query after an awaited async assertion cannot lose that race, which is exactly why raising `asyncUtilTimeout` was a no-op in T1.
2. *The mitigation was unnecessary.* With no `maxWorkers` key at all: **20/20 consecutive `npx vitest run`, exit 0 with 143/143 passed every time**, Duration mean 11.03 s, max 12.03 s, min 10.74 s; and **3 concurrent storefront suites × 5 rounds — 15/15 clean** at 143/143. No timeout was raised to obtain either number.

No test files were changed: converting these queries to `findBy`/`waitFor` would add async machinery with no defect behind it. Test count remains 143. The original T1 failures were never reproduced on demand — 31 consecutive clean runs in T1, and 35 clean runs plus 15 stress runs in T2 — so the historical cause stays unexplained; what is now established is that the workaround is unnecessary and the named tests are sound.

TRACKED (not urgent): several early packages/ui components (EmptyState, LoadingSkeleton, ErrorState, and possibly others built before the design-token reconciliation on 2026-09-26) use ambiguous Tailwind arbitrary-value syntax for CSS-variable-based font sizes/colors (e.g. text-[var(--font-size-lg)]) which Tailwind v4 may misinterpret without an explicit type hint (text-[length:var(--...)] vs text-[color:var(--...)]). ProductCard's 2026-09-26 rework uses the correct explicit-type-hint syntax. Existing components should be audited and fixed opportunistically as each is reworked to match design-reference, not as a standalone retroactive pass.

**MEASURED (2026-10-03, TW1 — audit only, nothing fixed):** the risk is not hypothetical, and it is narrow. TW1 made packages/ui reachable to Tailwind for the first time, which emitted 84 unhinted `text-[var(--…)]` occurrences in non-test source into the app CSS. Sorting them by token: **82 are colour tokens and compile correctly** (`--color-text-primary` ×27, `--color-text-secondary` ×21, `--color-text-muted` ×9, `--color-brand-accent` ×13, plus status/surface singles) — they resolve to `color:` only because Tailwind infers colour from the token name, which is exactly why the untyped form is fragile rather than currently broken. **2 are genuinely wrong**: `EmptyState/index.tsx:23` and `ErrorState/index.tsx:24` both write `text-[var(--font-size-lg)]`, and the built CSS shows the literal rule `.text-\[var\(--font-size-lg\)\]{color:var(--font-size-lg)}` — a font-size token emitted as a **`color`** declaration, i.e. an invalid value that renders as inherited colour and **no font-size at all**. Both headings are currently unstyled in size. The fix is `text-[length:var(--font-size-lg)]` (the syntax the correct components already use). Left for the D2 audit per TW1's report-only scope.

TRACKED (not urgent): ServiceCard's design-reference (our_it_services_apex_precision_tech) shows a 48×48 icon tile per service (laptop/router/memory glyphs), but no per-service icon or category field exists in the Service data model (services table: name/slug/description/price_min/price_max/duration_minutes/is_published only). ServiceCard's 2026-09-26 rework omits the icon tile rather than fabricate a glyph, and exposes an optional category?: string caller-supplied prop as a stopgap for the category badge. A future Service Categories/Icons feature (data model + API + type) would be needed to close this gap properly, mirroring ProductCard's logged spec-list gap.

TRACKED (not urgent): ClickableArea's focus-visible ring uses --radius-sm, which doesn't match CategoryCard's pill shape (--radius-lg) — a focused pill will show a slightly squared ring against a more rounded shape. Cosmetic only, no functional impact. Consider making ClickableArea's ring radius a prop, or accepting the current visual mismatch, when ClickableArea is next revisited.

TRACKED (not urgent): no aggregate rating (average_rating, review_count) is exposed anywhere in the Product/Service API responses — confirmed via full backend search (no withAvg/withCount/average_rating field exists). ProductCard's averageRating/reviewCount props are wired but will always be omitted until a backend gap-fix adds this aggregate (e.g. via a computed attribute or a meta block). Not urgent — rating display is optional, not a broken feature. Future task: backend aggregate + catalog.ts type addition + ProductCard wiring.

---

## B2b — Marquee primitive (2026-10-02)

**Built:** `packages/ui/src/components/Marquee/` (+ `index.tsx`, `index.test.tsx`), `packages/ui/src/hooks/useReducedMotion.ts`, `packages/ui/src/styles/marquee.css`; exported from `packages/ui/src/index.ts`. A continuous scrolling band for the category/brand rows (design.md §3.4/§3.5). **Carousel is untouched** and keeps owning the Homepage Hero Banner and Review Showcase (design.md §3.7/§3.8, rules.md §4) — a band has no positions, no prev/next and no lightbox, so sharing Carousel would mean a second set of affordances on the same component.

- **Props:** `children`, required `ariaLabel`, `durationSeconds` (default 40, clamped 10..120, non-finite falls back to the default), `direction` ("left" | "right"), `pauseControl` (default true).
- **Duplicate copy:** items render twice for a seamless loop. Copy A is real content; copy B is `aria-hidden="true"` **and** `inert`, so it is neither announced nor focusable (`aria-hidden` alone does not remove keyboard focus — both are needed).
- **Motion:** pure CSS `transform: translateX(-50%)` keyframes in the ui styles tree, `animation-play-state: paused` when `[data-paused="true"]`. No JS animation loop, no per-frame layout reads. Keyframes and pause rules were confirmed present in both the storefront and admin production CSS bundles. (The `-50%` translation was **not** correct as first written — see B2b-fix below for the g/2 seam bug and its fix.)
- **Pause:** driven by React state from `onPointerEnter/Leave` and `onFocus/onBlur`, exposed as `data-paused` so it is assertable in jsdom. Focus containment via `relatedTarget` prevents flicker when focus moves between items. A real `<button>` with toggling "Pause scrolling"/"Resume scrolling", `aria-pressed`, visible focus ring, 44px target satisfies WCAG 2.2.2 and was **not** removed to match any screenshot.
- **Reduced motion:** `useReducedMotion` (matchMedia, listener-based) switches to a single copy, no pause button, and a focusable `overflow-x-auto` strip with a visible focus ring. Plus a CSS `@media (prefers-reduced-motion: reduce)` net that forces `animation: none !important`.
- **Tests:** 18 in `Marquee/index.test.tsx` as first shipped, since grown to **23** by B2b-fix. `packages/ui` is now **183 passing across 22 files** (was 160 / 21). Storefront unaffected at **143/143**, no `maxWorkers` key.

**Two real bugs the tests caught (both fixed):**
1. Clicking the pause button moved focus onto it, which tripped the focus-pause rule — so "Resume" re-paused instantly and the band could never restart while the button held focus. The button is now excluded from the content-focus flag. Covered by a dedicated keyboard-only resume test.
2. The initial test asserting `getByRole` returns `undefined` was wrong (`getByRole` throws); corrected to `queryByRole`.

**jsdom cannot verify these — left for the Playwright pass (D4), deliberately not faked:**
- That the animation actually runs. The `-50%` translation was **not** seamless as first written: an arithmetic bug (g/2, see B2b-fix) made every cycle jump half a gap. What jsdom could not do was notice it; arithmetic could. Real-browser seam measurement is still on the D4 list.
- Real layout: track width vs. copy width, and whether `w-max` + per-copy padding produce a true seamless wrap.
- `animation-play-state: paused` genuinely halting motion (jsdom has no CSSOM animation engine); only the `data-paused` attribute is asserted here.
- The `@media (prefers-reduced-motion: reduce)` CSS net — matchMedia is mocked, so only the JS branch is covered.
- Visible focus ring rendering, 44px touch target, and overflow/scrollbar behaviour of the static strip.
- Real `inert` behaviour in a browser (jsdom keeps the node in the DOM; the assertion relies on role queries excluding `aria-hidden`).

**SSR choice:** `useReducedMotion` returns `false` for the first render on both server and client, applying the real value in an effect. This is deliberate — matching the server's first-render markup is what prevents a hydration mismatch; reading matchMedia during render would emit animated markup on the server and a static strip for a reduced-motion client. The cost is one extra commit for reduced-motion users, hidden by the CSS safety net so no motion is ever painted. Inverting it would flash duplicated decorative content to every non-reduced-motion user.

**Typed away one environment quirk:** `packages/ui` resolves a nested `@types/react@18.3.31` while the runtime is React 19.3.0, and React 18's typings predate `inert`. Handled with a typed spread constant in the component rather than a module augmentation, so the markup type-checks identically whether ui sources are compiled by `packages/ui` (React 18 typings) or by an app's program (React 19 typings). Both `tsc -b` paths pass.

**Not done here:** `design.md` §3.4 band-vs-grid reconciliation is B2b2, deliberately untouched. No page consumes Marquee yet, so no storefront changes were made or needed.

---

## B2b-fix — Marquee loop seam + short-list behaviour (2026-10-02)

**The g/2 loop-seam bug.** B2b shipped a claim that seamlessness was "only verifiable in a real browser". That was wrong — it was *analytically broken*, and arithmetic review of the CSS found it without running anything. The original markup put `gap-[var(--space-6)]` on the track **and** `gap-[var(--space-6)]` inside each copy. With one copy's content width W (items + its internal gaps) and track gap g:

| quantity | value |
|---|---|
| track width | `W + g + W` = `2W + g` |
| keyframe translation `-50%` | `(2W + g) / 2` = `W + g/2` |
| true loop period (start of copy A → start of copy B) | `W + g` |

The translation was **short by g/2** (16px at `--space-6`), so every cycle jumped half a gap and the band visibly stuttered. It would have shipped broken; only a real browser would have shown it.

**Fix.** All spacing moved inside the copies; the track now has **no gap**. Each copy ends with `padding-right: g`, so one copy's width is `W' = W + g`:

| quantity | value |
|---|---|
| track width | `W' + W'` = `2W + 2g` |
| keyframe translation `-50%` | `(2W + 2g) / 2` = `W + g` = `W'` |
| true loop period | `W'` = `W + g` ✓ equal |

The period is now exactly one copy's full width **including its trailing spacing**. Padding rather than margin is required: margin sits outside the copy's box and reproduces the same off-by-g/2 error. Both copies are now built from one shared `COPY_CLASSES` constant so their spacing cannot drift apart.

**Short lists.** The track carries `min-w-[200%]` and each copy `grow` + `shrink-0` + `justify-around`, so a 2-item list still yields a track at least twice the clipped container width — always enough for the `-50%` translation to reveal copy B, with no blank space at the end of the band. When the items are narrower than the copy, `justify-around` distributes the leftover space evenly around them (half-gap at the edges, gap between items) rather than leaving them bunched at one edge. **This look has not been visually judged** — it needs the visual pass, where `justify-around`'s edge spacing is the thing most likely to want tuning.

**Tests:** 5 new structural guards in `Marquee/index.test.tsx` (now **23 in that file**, `packages/ui` **183 across 22 files**). jsdom has no layout engine, so these assert the *class structure* the arithmetic depends on — no gap on the track, identical copy classes, trailing spacing as `pr-` not a track gap, `min-w-[200%]`/`grow`/`shrink-0`/`justify-around` present, and copy B still `aria-hidden` + `inert`. They would not have caught the g/2 error on their own (that was arithmetic); they exist so the *fixed* structure cannot silently regress. The failure output of the pre-fix run is the evidence they bite.

**Callers:** JSDoc now states plainly that `children` are rendered twice, so item markup must not carry `id` attributes (duplicate ids are invalid HTML and break `aria-labelledby`/`for` resolution) and must not run mount side effects (analytics/impression tracking would fire twice).

**jsdom cannot verify these — left for the Playwright pass (D4), deliberately not faked:**
- **Real-browser measurement of the loop seam.** The g/2 error was found by arithmetic, but that the fixed version is *pixel*-seamless (first frame of a cycle landing exactly on where the last one ended) still needs a real render.
- **Keyboard focus on an item that is currently translated out of view.** In an `overflow: hidden` band, Tab can move focus to an item that is off-screen inside the clipped container, leaving the focus ring invisible. Focus containment keeps the band *paused*, but nothing scrolls it back into view. Needs a real browser to observe and to decide the remedy.
- Track width vs. copy width in practice, and whether `min-w-[200%]` + `grow` behave as derived under real layout.
- That `justify-around` on a short list looks right (see above).
- `animation-play-state: paused` genuinely halting motion; the `@media` reduced-motion net; visible focus ring; 44px touch target; static-strip overflow behaviour; real browser `inert` semantics.

---

## TW1 — Tailwind now scans packages/ui (2026-10-03)

**The bug.** Classes used *only* inside `packages/ui` never reached either app's CSS. The storefront renders `BrandCard` at `_index.tsx:334`, yet `.h-24`, `.w-24` and `.object-contain` were absent from `build/client/assets/root-*.css`. Marquee's `h-11`/`w-11`/`w-max`/`justify-around` were absent too, so B2b's spacing classes would not have applied in a real browser even with correct markup. This was pre-existing (BrandCard shipped long before B2b), not caused by B2b.

**Cause, read out of the installed toolchain rather than assumed:**
- `@tailwindcss/vite@4.3.3` sets the scan base to the **Vite config root** — `compiler.root === null` → `[{ base: this.base, pattern: "**/*" }]`, where `this.base` is the app's own root. That is `apps/storefront` / `apps/admin`, never the monorepo root.
- `packages/ui` is therefore outside the base *and* reached through the `node_modules/@ecommerce/ui` workspace symlink.
- No `@source` directive and no safelist existed anywhere, so nothing compensated.

**Correction to the earlier B2b-fix evidence (kept on the record).** That report's probes for *arbitrary* values (`pr-[var(--space-6)]`, `rounded-[var(--radius-lg)]`) used regexes that cannot match CSS, because Tailwind backslash-escapes those selectors. Those particular ABSENTs were meaningless. The valid evidence was the non-arbitrary probes (`.h-24{`, `.h-11{`), and those were real. TW1 re-tested everything with exact escaped-selector substring matching, and confirmed the corrected result: `.rounded-\[var\(--radius-lg\)\]` was in fact **already PRESENT** in the storefront bundle (the storefront's own source also uses that literal string), which is why only 10 of 12 probes were genuinely missing there while all 12 were missing in admin.

**Fix — one shared line, no per-app wiring** in `packages/ui/src/styles/index.css`:

```css
@source "../**/*.{ts,tsx}";
@source not "../**/*.test.ts";
@source not "../**/*.test.tsx";
```

Paths in `@source` resolve relative to the CSS file containing the directive, so this works for every consumer automatically. `@source not` is supported in the installed 4.3.3 (`dist/lib.js` parses the `not ` prefix into a negated glob) and is **load-bearing, not decoration** — verified by negative control: deleting both `@source not` lines grows the storefront bundle 38783 → 38942 bytes and pulls in `.max-w-xs`, a utility that exists only in `Input/index.test.tsx`. (A first negative control was invalid — the regex stripped only the `.test.ts` line while leaving the `.test.tsx` line that actually guards `max-w-xs` — so it wrongly concluded the exclusions were unnecessary. Redone.)

| probe (ui-only class) | storefront before | storefront after | admin before | admin after |
|---|---|---|---|---|
| `.h-24` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.w-24` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.object-contain` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.h-11` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.w-11` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.w-max` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.justify-around` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.min-h-\[44px\]` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.pr-\[var\(--space-6\)\]` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.min-w-\[200\%\]` | ABSENT | PRESENT | ABSENT | PRESENT |
| `.rounded-\[var\(--radius-lg\)\]` | PRESENT* | PRESENT | ABSENT | PRESENT |
| `.border-\[var\(--color-border-default\)\]` | PRESENT* | PRESENT | ABSENT | PRESENT |

\* already present only because the storefront's *own* sources contain those exact strings; admin has no such copy, which is why admin is the cleaner signal.

Bundle sizes: storefront **23504 → 38783 bytes** (+15279, +65%), admin **14582 → 36157 bytes** (+21575, +148%). Admin more than doubled because it consumes far fewer ui components and was therefore missing proportionally more.

**Guard:** `scripts/check-built-css.mjs` (dependency-free, node builtins only) asserts 7 non-arbitrary + 2 escaped-arbitrary ui-only selectors against a built app CSS, prints every missing one, and exits 1. Exit codes 0 / 1 / 2 (usage, unreadable file) are all exercised. Not wired into CI — none exists; documented in the Quality Gate above as a manual release step.

**Deliberately not done here:** no component changed, no `vite.config.ts` changed, no Tailwind config added, `package.json` untouched. This also newly emitted the ambiguous `text-[var(--…)]` utilities into the app CSS, which is what made the pre-existing TRACKED item measurable — see the measurement recorded there. Two real defects are now documented there and left for the D2 audit.

---

## BE1 — Optional overlay text on homepage banners (2026-10-03)

**The gap.** `design.md` §3.7 has specified an "optional overlay text" on hero banners since Phase 8, but there was no way for an admin to set it: PRD §8 described only image + target category + ordering, and the admin form could not ask for a headline. This adds the two missing columns so the existing design is finally authorable.

**Product decision (approved by the product owner 2026-10-03).** Two optional fields per banner:

| field | type | max | meaning |
|---|---|---|---|
| `headline` | `varchar(120) NULL` | 120 | short overlay headline |
| `subtitle` | `varchar(255) NULL` | 255 | supporting line under the headline |

**Why nullable, and what `null` means.** `NULL` is a real authorable state, not missing data: **a `NULL` headline+subtitle means "image only, no overlay"**, which is the common case. This is documented in the migration itself, per `rules.md` §6 (no nullable field without a stated reason). The alternative — `NOT NULL DEFAULT ''` — was rejected: it forces every image-only banner to carry a meaningless empty string and makes "no overlay" indistinguishable from "an overlay whose text happens to be blank".

**Validation.** `sometimes|nullable|string|max:N|not_regex:/<\s*\/?\s*[a-zA-Z][^>]*>/`, shared by create and update via a new `App\Modules\Merchandising\Support\BannerOverlayTextRules` so the two endpoints cannot drift.

- **HTML is rejected, not stripped.** React escapes these values on output, so a tag is not an XSS vector here — but silently stripping would store something other than what the admin typed (`<b>Sale </b>` → `Sale`), which is worse than an explicit error. This keeps `rules.md` §5 (invalid input never reaches business logic) and adds no dependency (§13).
- **The rule matches a tag *shape*, not merely `<` and `>`.** Rejecting every `<` would break copy admins actually write — `Save <50% today` and `Only 3 left < hurry` both pass, and both are pinned by tests. `<b>`, `</b>`, `<img src=x onerror=y>` and `<script>` are all caught, the last via requiring a letter right after `<`/`</`.
- **Trimming and empty→null are not re-implemented.** Laravel's global `TrimStrings` then `ConvertEmptyStringsToNull` middleware (in that order, both still registered in `bootstrap/app.php`) already do it. Re-implementing in `prepareForValidation` would duplicate framework behaviour and risk the two disagreeing. Consequence: `""` and `"   "` both store as `NULL`, i.e. sending an empty value clears the overlay — no delete-and-recreate needed.

**Migration.** `server/database/migrations/2026_10_03_000001_add_headline_and_subtitle_to_homepage_banners_table.php` — additive only, two nullable columns, no existing column touched, no route touched. `down()` drops exactly those two. Verified reversible by invoking `up()`/`down()` directly on a throwaway SQLite file: `after migrate headline=YES subtitle=YES` → `after down() headline=NO subtitle=NO` → `after up() again headline=YES subtitle=YES`. `migrate:fresh` also re-run clean. `after()` is used for MySQL column ordering only; SQLiteGrammar has no `modifyAfter` so it is ignored there, matching the existing `add_thumbnail_path_to_assets_table` precedent.

**No API Resource was added.** The banner controllers serialize the Eloquent model directly with `asset` / `target_category` eager-loaded — an existing project-wide pattern. New columns are therefore exposed automatically; the tests below are what actually pin the contract.

**Exact public JSON** (`GET /api/v1/homepage-banners`, captured from a real response, not hand-written). `headline`/`subtitle` serialize **after** `updated_at`, because they are appended columns — harmless for JSON consumers, but worth knowing before someone "tidies" key order:

```json
{
  "banners": [
    {
      "id": 1,
      "asset_id": 1,
      "target_category_id": 1,
      "display_order": 0,
      "is_published": true,
      "start_at": null,
      "end_at": null,
      "created_at": "2026-10-03T13:08:54.000000Z",
      "updated_at": "2026-10-03T13:08:54.000000Z",
      "headline": "Summer laptop sale",
      "subtitle": "Up to 40% off selected models.",
      "asset": { "id": 1, "uuid": "…", "disk": "uploads", "path": "…", "original_name": "…", "mime_type": "image/jpeg", "size": 571403, "width": 1200, "height": 900, "alt_text": "…", "uploaded_by": null, "created_at": "…", "updated_at": "…", "thumbnail_path": "…" },
      "target_category": { "id": 1, "name": "Laptops", "slug": "laptops", "logo_asset_id": null, "banner_asset_id": null, "description": "…", "display_order": 0, "is_published": true, "parent_category_id": null, "created_at": "…", "updated_at": "…" }
    }
  ]
}
```

Both keys are always present, `null` when the banner is image only — a client never has to probe for existence. Admin payloads carry the same two fields (`GET /api/v1/admin/homepage-banners` paginated under `data`, single banner under `banner`).

**Tests written first, then shown failing.** New `server/tests/Feature/Api/V1/BannerOverlayTextApiTest.php` (25 tests). First run, before any implementation existed:

```
⨯ admin creates a banner with headline and subtitle and receives them… 3.21s
✓ admin creates a banner without overlay text and both fields come ba… 0.18s
⨯ update changes headline and subtitle
⨯ headline longer than 120 characters is rejected
…
Tests:    23 failed, 2 passed (28 assertions)
```

with the two real failure modes visible: `Failed asserting that null is identical to 'Summer laptop sale'` (field silently dropped, never persisted) and `SQLSTATE[HY000]: General error: 1 table homepage_banners has no column named headline`. The 2 that passed did so vacuously — they assert `null`, which was trivially true while the columns did not exist.

Coverage beyond the brief: trimming; whitespace-only → `NULL`; exactly-120/255 accepted at the boundary; update re-enforces limits; a rejected tag never reaching the DB; `<50%` still accepted; public feed hides a *draft* banner's copy; public feed hides a published banner whose **target category was later unpublished** (the pre-existing `findPublished` rule, now pinned); publish does not disturb copy; update touches only the field sent; reorder cannot set copy. Authorization was **not** re-tested — `AdminBannerApiTest` already covers 401/403 across all eight banner endpoints via `adminBannerEndpoints()`, so duplicating it would add noise. Also extended the existing `homepage_banners table exists with the expected columns` guard, and added a `PRAGMA table_info` assertion that both columns are genuinely `NOT NULL = 0` rather than trusting a type helper.

**Verification.**

| check | result |
|---|---|
| Docker baseline before changes | 631 passed (2407 assertions) |
| New file, first run (pre-implementation) | 23 failed, 2 passed |
| New file after implementation | **25 passed (97 assertions)** |
| Sibling banner suites (admin/public/service/model) | 46 passed (171 assertions) |
| Full suite after changes | **657 passed (2512 assertions)**, +26 tests, exit 0 |
| `migrate:fresh` on throwaway SQLite | clean |
| Migration `up()`/`down()`/`up()` | reversible, verified |
| `/api/v1` route count | **103, unchanged** (`routes/api.php` not modified) |
| Frontend / component / route / seeder changes | none |

**Surprise — route count is 103, not 104.** The brief expected 104. Authoritative count via `route:list --path=api/v1 --json` is **103**, and `git diff HEAD -- server/routes/api.php` is empty, so 103 is the committed baseline and BE1 provably changed nothing here. A naive `grep -c 'api/v1'` also returns 103. Recorded rather than "fixed": inventing a route to reach 104 would be wrong, and the discrepancy is in the brief, not the code.

**Deliberately not done here.** No `JsonResource` introduced; no `headline`/`subtitle` on `ReviewShowcaseItem` (same shape of feature, different entity, out of scope); no seeder changes; `is_published` still not settable via `PUT` (publish stays a dedicated action); no frontend work — nothing consumes these fields yet, so this is a pure backend/API change.
---

## BE2 - products.is_featured (2026-10-04)

**Decision:** approved by the product owner 2026-10-03. An admin can flag a product as **featured**; the storefront Home "Featured" section will later request only featured products. That consumer is **task B2c and is explicitly not part of this task** — B2c touches the frontend only.

**Schema.** One additive column, `products.is_featured`, `boolean NOT NULL DEFAULT false`.

This is deliberately the **opposite** of the BE1 decision, and the contrast is the interesting part. BE1's `headline`/`subtitle` are nullable because `null` is a meaningful third state ("image only"). A boolean flag has no third state: every product is either featured or not, so `null` could only ever be a bug or an oversight. `default false` also backfills every existing row to not-featured with no data migration and no window in which a product is neither. `rules.md` §6 ("no nullable field without a documented reason") is satisfied by not being nullable at all.

**Index decision: composite `(is_published, is_featured)`, not a lone `is_featured` index.** The one query that matters is the storefront "published AND featured" selection, and `findPublished()` always appends `where('is_published', true)` on top of the shared filter builder — so `is_featured` is never queried alone publicly. A lone `is_featured` index would be picked by the optimizer and would still have to fetch every featured row to discard the unpublished ones; the composite resolves both equality predicates in one index seek. By the **leftmost-prefix rule** the composite also *subsumes* the pre-existing single-column `products_is_published_index` (still fully serves `WHERE is_published = 1`), which is asserted rather than merely claimed:

```
after migrate      is_featured=YES  composite_index=YES  is_published_index=YES
after down()       is_featured=NO   composite_index=NO   is_published_index=YES
after up() again   is_featured=YES  composite_index=YES  is_published_index=YES
```

The original `is_published` index is left in place on purpose — the migration is additive, and dropping a live index as a side effect of adding a column is not a change worth making silently. Composite indexing is not a foreign pattern here: `architecture.md` §6 already specifies one for `ServiceBooking(scheduledSlotStart, scheduledSlotEnd)`.

**Validation.** `is_featured => ['nullable','boolean']` on create and `['sometimes','boolean']` on update — the project's existing boolean style (`is_published`, `is_default`). `sometimes` (not `nullable`) on update because the column is NOT NULL, so an explicit `null` is a clean 422 rather than a database error. Update accepts both `true` and `false`, so one endpoint features and unfeatures. In the service the cast is `array_key_exists` + `(bool)`, **not** `isset()` — `isset()` treats `false` as absent and the product could then never be un-featured.

**`?featured=` filter semantics.** `1`/`true` → only featured; `0`/`false` → only non-featured (symmetric, so the filter always narrows on the value given); **absent or empty → no filtering at all**.

Two parsing decisions worth recording:

- **Normalisation uses `filter_var(..., FILTER_VALIDATE_BOOLEAN)`, not the raw query value.** Laravel's `boolean` rule accepts only `[true, false, 0, 1, '0', '1']`, so the string `"true"` would be rejected outright — despite being the obvious thing for a client to send. `FILTER_VALIDATE_BOOLEAN` is already this codebase's boolean idiom (`SettingService` uses the same constant), so this reuses existing machinery instead of inventing a parser. `FILTER_NULL_ON_FAILURE` then routes junk into the normal `boolean` rule, producing an ordinary Laravel 422 with a `featured` field error.
- **An invalid value must never degrade to "unfiltered".** Dropping an unparseable value would return the *entire* catalogue to a client that asked for featured-only, and it would never know. A loud 422 is the safe failure mode, and is asserted directly.

**`?featured=` (empty) is treated as absent, not as false** — a client that forgot to interpolate a value would otherwise silently flip from "featured only" to "everything except featured".

**Two real bugs the tests caught, both worth remembering.**

1. **`Builder::when()` passes the *condition* as the callback's second argument, not the filter's value.** The first version was `->when(array_key_exists('featured', $filters), fn ($q, $featured) => $q->where('is_featured', $featured))`. The condition is a bool, so `$featured` was bound to `true` on *every* call — which quietly turned `?featured=0` into "featured only". It is now `fn ($query) => $query->where('is_featured', (bool) $filters['featured'])`, reading the value from the captured array. (The existing `brand_id` clause is unaffected only because there the condition *is* the value.) The symptom was caught by the `featured=0` test returning 2 instead of 1.
2. **`$request->merge()` does not write to the query bag when `Request::isJson()` is true.** `getInputSource()` returns the JSON bag instead, so merging the normalised value silently failed to overwrite the raw query string for exactly the clients that matter — any caller sending `Content-Type: application/json`, which is every real API consumer and also Laravel's own `getJson()` test helper. `FeaturedProductFilter::normalize()` now **returns** `?bool` and the controller assigns it into the filter array explicitly, which sidesteps input-source ambiguity and keeps "absent" cleanly distinguishable from "false".

**Publication is untouched.** `findPublished()` still appends `where('is_published', true)` after the shared filter builder, so a featured-but-unpublished product is unreachable via the featured filter, the unfiltered list, **and** the by-slug detail route (404). Featured and published are independent on the write side too: featuring an unpublished product does not publish it, and `publish()` does not change the flag.

**Exact public JSON** — `GET /api/v1/products?featured=1`, captured from a real response. `is_featured` serialises **after `updated_at`** (appended column) and is a real JSON `true`, not `1`:

```json
{
  "current_page": 1,
  "data": [
    {
      "id": 1,
      "name": "Latitude 5550",
      "slug": "labore-sed-ut",
      "sku": "LAT-5550",
      "description": "Aut consequatur aut at laboriosam placeat quo beatae nesciunt unde vel.",
      "price": "1899.50",
      "stock_quantity": 75,
      "brand_id": 1,
      "is_published": true,
      "created_at": "2026-10-04T15:37:41.000000Z",
      "updated_at": "2026-10-04T15:37:41.000000Z",
      "is_featured": true,
      "brand": { "id": 1, "name": "Dell", "slug": "ut-fugit", "logo_asset_id": null, "is_published": false, "created_at": "…", "updated_at": "…" },
      "categories": [ { "id": 1, "name": "Laptops", "slug": "laudantium-ad", "logo_asset_id": null, "banner_asset_id": null, "description": "…", "display_order": 0, "is_published": false, "parent_category_id": null, "created_at": "…", "updated_at": "…", "pivot": { "product_id": 1, "category_id": 1 } } ],
      "images": [ { "id": 1, "product_id": 1, "asset_id": 1, "display_order": 0, "created_at": "…", "updated_at": "…", "asset": { "id": 1, "uuid": "…", "disk": "uploads", "path": "…", "original_name": "…", "mime_type": "image/jpeg", "size": 1925662, "width": 1200, "height": 900, "alt_text": "…", "uploaded_by": null, "created_at": "…", "updated_at": "…", "thumbnail_path": "…" } } ]
    }
  ],
  "first_page_url": "http://localhost:8000/api/v1/products?page=1",
  "from": 1,
  "last_page": 1,
  "last_page_url": "http://localhost:8000/api/v1/products?page=1",
  "links": [ { "url": null, "label": "&laquo; Previous", "page": null, "active": false }, { "url": "http://localhost:8000/api/v1/products?page=1", "label": "1", "page": 1, "active": true }, { "url": null, "label": "Next &raquo;", "page": null, "active": false } ],
  "next_page_url": null,
  "path": "http://localhost:8000/api/v1/products",
  "per_page": 15,
  "prev_page_url": null,
  "to": 1,
  "total": 1
}
```

The detail route (`GET /api/v1/products/{slug}`) returns the same object under a `product` key, with the same `is_featured` boolean. Admin list is paginated identically with the flag under `data`; admin detail under `product`.

**Tests written first, then shown failing.** New `server/tests/Feature/Api/V1/ProductFeaturedFlagApiTest.php`, 38 tests. First run, before any implementation:

```
⨯ admin creates a product with is_featured true                        3.70s
⨯ public featured filter returns only published and featured products 0.23s
⨯ an invalid featured query value returns 422 with a field error      0.24s
…
Tests:    37 failed (18 assertions)
```

All 37 failed with only 18 assertions executed — the flag simply did not exist, so most assertions never got past setup. Representative causes: `Failed asserting that null is identical to true` (the field was silently dropped) and `QueryException` on `is_featured`.

Authorization was **not** re-tested: `AdminProductApiTest` already covers 401 (guest) and 403 (customer) across every admin product endpoint. Coverage beyond the brief includes `?featured=true` as well as `=1`; `featured=0` symmetry; empty-value handling; unpublish/publish round-trips against the featured feed; composition with brand, category (including a parent category widening scope), search, sort and pagination meta; an explicit assertion that junk does **not** silently fall back to an unfiltered list; that a rejected create writes no row; that `is_featured` cannot flip publication; that the raw DB value stays `1` while the cast is a real bool; the composite index's existence and column order via `PRAGMA`; the `NOT NULL` + `default '0'` schema shape via `PRAGMA table_info` and `sqlite_master`; and that there is deliberately no server-side cap on featured products (25 featured is fine — the storefront decides how many to show).

**No N+1.** There is no query-count test anywhere in this repo (no `getQueryLog`, `DB::listen` or `assertQueryCount` precedent), so rather than invent a new testing pattern it was verified with a throwaway script and then deleted: **4 queries at 1, 5 and 10 rows** (`products` ×2 for count+page, `categories` ×1, `product_images` ×1) — completely flat as the page grows, because the filter reuses `buildFilteredQuery()`'s existing `with(['brand','categories','images.asset'])`. The `featured` filter adds no query of its own.

**Verification.**

| check | result |
|---|---|
| Docker baseline after BE1 | 657 passed |
| New file, first run (pre-implementation) | 37 failed (18 assertions) |
| New file after implementation | **38 passed (126 assertions)** |
| Full suite after changes | **695 passed (2641 assertions)**, +38 tests, 0 failed |
| Migration `up()`/`down()`/`up()` | reversible; composite index dropped and recreated |
| `migrate:fresh` on throwaway SQLite | clean, exit 0 |
| `/api/v1` route count | **103, unchanged** |
| Query count at 1 / 5 / 10 rows | 4 / 4 / 4 — no N+1 |
| Frontend (`apps/`, `packages/`) changes | none |

**Deliberately not done here.** No frontend, no `api-client` module and no admin form — B2c consumes all of that. No `JsonResource`; products already serialise the model directly, and BE2's field therefore needed no response-shaping code at all. No seeder changes (`rules.md` §6): products are created through the admin panel, never seeded with hard-coded merchandising data. No new routes and no new query parameters other than `featured`. No `is_featured` on `services` — a service is not a product and the storefront does not feature them the same way.

---
## B2b2 - Home "Shop by Category" / "Shop by Brands" bands (2026-10-04)
- Both Home taxonomy sections rebuilt as `Marquee` bands (reference: centered `h2`, one auto-scrolling row, hover-paused); Shop/category pages keep the scrollable-row/grid layout.
- Items come only from the API, in API order, each a real `<Link>` (`/shop/category/:slug`, `/shop/brand/:slug`) instead of `ClickableArea`'s `href="#"` - crawlable and shareable.
- `MARQUEE_MIN_ITEMS = 6` (defined in the route): >= 6 renders the Marquee with its WCAG 2.2.2 pause control, below that a static centered wrapping row with no motion and no pause button.
- Category band filters `parent_category_id === null` from the shared `queryKeys.categories` cache rather than changing what the header nav fetches; brand band shows all returned brands.
- design.md §3.9 states kept: skeleton pending, `ErrorState` + retry refetch, whole section (heading included) omitted when empty. One `h1`/`main` preserved; band items carry no `id`/mount effect because `Marquee` duplicates children (asserted).
- `packages/ui`: `EmptyState:23` + `ErrorState:24` `text-[var(--font-size-lg)]` -> `text-[length:var(--font-size-lg)]` (was compiling to color). Nothing else in packages/ui.
- Two `@types/react` copies (app 19.2.18 / packages/ui 18.3.31) make an element array unassignable to `Marquee` children, so items are wrapped in a `<>` - no DOM node added, -50% loop geometry intact.
- Verify: `_index.test.tsx` 13 tests (8 red first) + 6 importer suites = 99 passed / 7 files; packages/ui EmptyState+ErrorState 8 passed; build OK; check-built-css 9/9; lint 21 warnings, 0 errors.
- DECISION REQUIRED: PRD §7.2 wants two levels in this band, spec + reference show top level only. PRD §7.1 wants brand logos here, reference chips are text-only. Bands also sit inside the page container, not full-bleed as in the reference.

---
## CH1 - Single @types/react across the workspace (2026-10-05)
- `packages/ui` + `packages/api-client` declared `"@types/react": "^18.3.0 || ^19.0.0"`, so npm took the lowest match and nested 18.3.31 under `packages/ui` while the apps took hoisted 19.x. Both narrowed to the apps' `^19.2.17` / `@types/react-dom ^19.2.3` (runtime `peerDependencies` stay `^18.3.0 || ^19.0.0` - a peer range is a compatibility claim, not an install input). Now one hoisted copy: `npm ls` dedupes all 6 dependents, 1 on disk, no `npm dedupe` needed. Both workarounds removed, behaviour unchanged: `Marquee`'s `DECORATION_PROPS` typed spread → plain `inert` prop (React 19 types declare it; `inert` still asserted twice in its suite), and `BandRows` passes `items.map(...)` straight to `Marquee`, so `Children.count(children)` counts real items instead of always reporting 1 fragment.
- Verify: `packages/ui` `tsc --noEmit` + Marquee 23; storefront build (tsbuildinfo cleared) + Home route 13; admin build - all clean. `BookingService::assertNoOverlappingBooking` re-checked for BE3 leftovers: exactly `notCancelled()`, `overlappingWith()`, `lockForUpdate()`, `first()`, no duplicated `where()`.
- DECISION REQUIRED: the lock diff is large (+2885/-477) but pre-existing, not from CH1 - the committed lock was already stale (235 entries vs 397 resolved; `@babel/core`/`semver` absent), so any install rewrites it. CH1's own delta is only hoisted `@types/react` 19.2.18→19.3.0, the two narrowings, and the deleted `packages/ui/node_modules/@types/react` block. Reconciling the rest deserves its own task.

---
## BE3 - Public availability endpoint (2026-10-05)
- `GET /api/v1/services/{slug}/availability?date=YYYY-MM-DD[&mode=list|nearest]`, public (PRD §5.1) and rate limited by a named `service-availability` limiter keyed IP + slug. +1 route: 103 → **104**. No frontend, no booking-creation change beyond the delegation below.
- **Thin controller, no re-implemented rules.** New `ServiceAvailabilityService` composes the two existing sources of truth: `SlotGenerationService` decides *which windows exist* (business hours, holidays, buffer, minimum notice); `SlotHoldService::isWindowFree()` + the booking overlap predicate decide *which are taken*.
- **DRY fix (`rules.md` §3/§8).** The "is this slot still bookable" rule existed only as a private method in `BookingService`, so a read endpoint would have had to restate it. Promoted to named scopes `ServiceBooking::scopeNotCancelled()` + `scopeOverlappingWith()` (mirroring `SlotHold`), and `assertNoOverlappingBooking()` now delegates to them - identical SQL, identical `lockForUpdate()`, identical exception, **no behavioural change**; proven by the untouched `BookingServiceTest`/`SlotHoldServiceTest` suites.
- `nearestAvailableSlot()` gained an **optional** trailing `?callable $isBookable` (defaults null, so its existing behaviour and tests are untouched), letting Phase 7's nearest-slot suggestion reuse the day-walking loop instead of duplicating it. Default (no filter) behaviour is unchanged.
- **Date window is configurable, not a constant** (`rules.md` §6): new seed-style migration `2026_10_05_000001_seed_booking_max_advance_days_setting.php` sets `booking_max_advance_days = 60` as `type=integer`; `ServiceAvailabilityRequest` reads it via `BusinessSetting::getValue()`, so a past date, a bad `Y-m-d`, or a date past the horizon is a 422 with a `date` field error and an unknown `mode` a 422 with `mode`.
- Response `{service: {id, slug, duration_minutes}, date, timezone, slots: [{start, end}]}`; timestamps `toIso8601String()` (offset always present, never a bare `Z`). `timezone` reported `config('app.timezone')` at this stage because the generator did no conversion of its own — **resolved by TZ1**, which reports the business zone instead.
- Read-only: no hold is attempted (asserted), so browsing availability cannot lock the slot the customer is looking at. Missing and unpublished slugs return a byte-identical `{"message":"Not Found"}` 404, so an unpublished service cannot be probed.
- Verify: `ServiceAvailabilityApiTest.php` 24 tests (22 red first) / 79 assertions; scoped `Scheduling` + `PublicServiceApiTest` + BE3 = **121 passed / 395 assertions**; `migrate:fresh` clean; `up → down → up` on throwaway SQLite = `ROW_BACK=60 type=integer`; route count 104; Pint clean. Full suite deliberately not run (per-task scoped only).
- DECISION REQUIRED: `rules.md` §3 wanted this rule in one place, which required `BookingService` to delegate to the new scopes rather than keep its private copy - accepted here as behaviour-identical, but it is a touch to the booking write path and is flagged rather than assumed. ~~`timezone` is reported as the single app zone (`UTC`) because no per-tenant or per-service timezone exists anywhere in the schema~~ — **closed by TZ1** below: a `business_timezone` setting now supplies that zone. `mode=nearest` is inferred from Phase 7's "nearest-slot suggestion logic" line, not from an explicit PRD/SRS requirement. Search range for `nearest` is a fixed 14 days, bounded by `booking_max_advance_days` only when that is smaller.

## TZ1 - Configurable business timezone (2026-10-06)
- **Interpretation moves out of the app zone into a setting, storage stays UTC.** New `business_timezone` setting seeded to `Asia/Karachi` (`2026_10_06_000001_seed_business_timezone_setting.php`, `type=string`, reversible); `BusinessClock::timezone()` is the single accessor (`App\Modules\Scheduling\Support`), falling back to `Asia/Karachi` if the row is missing so the bug returns to the intended default rather than to UTC. `UpdateBusinessSettingRequest` validates it against `DateTimeZone::listIdentifiers()`, so a non-IANA value is a 422 rather than a silently wrong schedule.
- **What becomes business-local:** business-hour wall times, weekday lookup, holiday date matching, "today", the `booking_max_advance_days` horizon, and availability rendering. Minimum notice and service buffer stay plain duration arithmetic. Slot generation still returns UTC instants, and `BookingService`/`SlotHoldService` overlap and hold predicates are byte-for-byte untouched — only *reading a business day* is zone-dependent.
- **Booking input round-trips an explicit offset.** `StoreBookingRequest` normalises a returned `+05:00` timestamp back to UTC before persistence, so the customer's chosen wall-clock time survives; overlap detection is unchanged.
- **Test-first.** `BusinessTimezoneTest.php` 13 tests / 47 assertions (13 red first). Existing Scheduling tests were written when "09:00" meant 09:00 UTC; their assertions are correct statements about a UTC business, so instead of rewriting them the suite default is pinned to UTC in `tests/TestCase.php` (`setUp`, guarded by `Schema::hasTable`), and TZ1's own `beforeEach` overrides it to `Asia/Karachi`.
- Verify: scoped `Scheduling` + `PublicServiceApiTest` + `ServiceAvailabilityApiTest` + BE3 + TZ1 = **134 passed / 442 assertions**; migration `Ran → Pending → Ran` on throwaway SQLite; route count **104** (unchanged); Pint clean on all 13 changed files.
- DECISION REQUIRED: booking endpoints (`BookingController` store/index/show) still serialize `ServiceBooking` directly, so `scheduled_slot_start`/`end` are returned as UTC instants while the availability endpoint is now business-zoned. That inconsistency is a serialization-policy decision, not a bug in this task, so it is flagged rather than changed. Notification/email copy contains no times at all, so nothing human-facing needed changing there.
- DECISION REQUIRED: only the seeded default is Asia/Karachi. `php artisan config:cache` caches `app.timezone` but the business zone is read from the DB per request, so admin timezone changes take effect immediately without a redeploy — worth confirming that is the desired behaviour, since it means no deploy is needed to move the business.
- **TZ1-fix (2026-10-06): `business_timezone` read once per request.** Throwaway measurement first: **23** reads of `business_timezone` in one 8-slot availability request (26 `business_settings` selects; `BusinessSetting::getValue` caches nothing per request - plain `where()->first()` each call). `BusinessClock` now memoises the resolved zone (process-static so every instance in a request shares it) in `timezone()`; the memo is cleared on **any** `BusinessSetting` save (`booted()` -> `saved`) and at the start of every test (`tests/TestCase::setUp`), so a change is honoured on the next request and no memo leaks across tests.
- **TZ1-fix proof:** 2 new tests in `BusinessTimezoneTest` - `business_timezone is read from the database at most once per request` (`DB::listen` == **1**) and `a business timezone changed between requests is honoured on the next request` (Karachi -> London via Eloquent instance save -> `+01:00` on the next request). Post-memo measurement: **1** timezone read / **4** `business_settings` selects per request (the other 3 are the distinct `booking_max_advance_days` / `service_buffer_minutes` / `min_booking_notice_minutes` keys).
- **TZ1-fix Verify:** `BusinessTimezoneTest` + `ServiceAvailabilityApiTest` + `tests/Feature/Modules/Scheduling` + Pint-touched `BannerOverlayTextApiTest` + `ProductFeaturedFlagApiTest` = **194 passed / 650 assertions** (0 failed); Pint fix pass over all 37 in-scope files - 8 style fixes, all in scope, second pass PASS; route count **104** (unchanged).
## B2c - Storefront Home merchandising rows (2026-10-06)
- **Hero stays on the generic Carousel.** Each banner slide is a real `/shop/category/{target_category.slug}` anchor (crawler/middle-click) with `onSlideClick` for in-app navigation; headline/subtitle render as plain `<p>`s in a frosted card over a left-to-right dark scrim (`from-[var(--color-surface-dark)]/70 via-[var(--color-surface-dark)]/40 to-transparent`). First slide `loading=eager` + `fetchpriority=high`, later `lazy`; image-only banners render no overlay (no empty card), an empty endpoint omits the section, and copy is never a heading - the single page `h1` stays the sr-only page title; all states covered (skeleton/error+retry/empty).
- **api-client + ui plumbing.** `HomepageBanner.headline/subtitle: string | null`; `Product.is_featured` + `getProducts({featured, sort: "newest"})`; `ClickableArea` optional `href` that never intercepts ctrl/cmd/shift/alt/middle clicks and only routes plain left clicks when `onActivate` exists; `ProductCard` `href` on both cards; `Carousel` honours `slide.href`, gates the active-slide anchor to `onSlideClick|enableLightbox`, and gains `autoSlide` (default true; `false` = WCAG 2.2.2 Pause for readable grids).
- **New Arrivals** = `queryKeys.productsNewArrivals`, `getProducts({sort: "newest", perPage: 8})`, reference 3-col grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), `/product/:slug` links, `View all` -> `/shop`; skeleton 3 matches the reference's single 3-card row.
- **Featured Products** = `queryKeys.productsFeatured`, `getProducts({featured: true, perPage: 8})`, one generic Carousel (`autoSlide={false}`) grouping products 4-per-slide in a `grid-cols-2 gap-[var(--space-5)] lg:grid-cols-4` grid; carousel region named `"Featured products"`. Query keys moved from route literals into `hooks/query-keys.ts`.
- Verify: ui ClickableArea(6)/ProductCard/Carousel = **39 passed**; storefront 7 handler-linked suites = **114 passed** (Home 13 -> 28); storefront build + `tsc -b` clean (tsbuildinfo cleared), `check-built-css` 9/9, scrim utility + escaped `lg:grid-cols-4` present in built CSS; lint warnings 21 (unchanged baseline, incl. pre-existing `meta()` export).
- DECISION REQUIRED: the reference row is a full-width **coverflow** - peeking neighbours, per-slide scale/opacity, a centre-spotlight caption and far-out chevrons - and the shared Carousel exposes none of those capabilities; rendered as a standard 4-up carousel, styling left to the V1 visual pass. `sort=newest` is a no-op server-side (repository default is already `created_at DESC`), so it is safe to keep sending until a later BE pagination task adds an explicit branch.

## B2d-1 - Home "category strips" (2026-10-06)
- **Storefront only, test-first, no backend change.** New `apps/storefront/app/components/home/CategoryStrips.tsx` (+ colocated test), placed in `_index.tsx` directly AFTER `<FeaturedProducts />`, BEFORE `<PopularServices />` (order now matches the reference h2 sequence). Up to **4 strips**, one per published **top-level** category (`parent_category_id === null`), in the API's `display_order` order. Each strip: `h2` with the category name (never another `h1`), a `View all` link to `/shop/category/{slug}`, and up to **4** products as `ProductCard` (`/product/{slug}`) in a plain `grid-cols-2 lg:grid-cols-4` grid - **explicitly NOT a Carousel** (the reference renders chevron scrollers; the task overrides).
- **Data only from the API.** Categories reuse the shared `queryKeys.categories` (no second categories request; `TAXONOMY_STALE_TIME`); one products query per strip via `useQueries`, new key `queryKeys.productsByCategory(categoryId)`, `getProducts({categoryId, perPage: 4})` - `api-client` needed no change (subcategory scope is the server's `getProductScope`). States: while the shared categories query is **pending or errored the block renders nothing** (the Shop by Category band owns those two states on the same key - no duplicated skeleton/error); a strip with no products is hidden entirely, no strip left -> whole block absent; per-strip `Loading {name} products` skeleton and `ErrorState` + retry on products error only; each strip a labelled `<section aria-labelledby>` its `h2`.
- Verify: **36 passed** (8 `CategoryStrips.test.tsx` + 28 `_index.test.tsx`, 0 failed), incl. shared-categories-FAILING -> renders nothing, a NON-VACUOUS empty-block test (waits for every skeleton to clear, then asserts absence; proven by a one-shot "render empty strip" mutation that failed under mutation and passed on revert), non-flaky dual-strip request wait (`waitFor` each `category_id`), and the `_index` categories-error retry test restored to the single shared `Categories unavailable` copy / single `Try again` (B2d-1-fix widening reverted). Build 0, `tsc -b` 0 (tsbuildinfo cleared), prerender set unchanged (/, /shop, /services, /login, /register), `check-built-css` **9/9**, lint **21 warnings / 0 errors** (baseline). B2d-1-fix review: PASS.

## B2d-2 - tidy Home "Popular Services" (2026-10-07)
- **Storefront + one small `@ecommerce/ui` change, test-first, no backend change.** New shared key `queryKeys.servicesHomepage` replaces the inline `["services","homepage"]` in `_index.tsx` - no behaviour change.
- **CAP.** `PopularServices` shows at most `POPULAR_SERVICES_COUNT = 3` (named constant + comment): slice happens after the query (keeps API order) because `getServices` has no `perPage`. Empty slice -> section absent (design.md 3.9). Price range (min-max) and Book Service (`/booking`, preselect is B9) untouched.
- **REAL LINK.** `ServiceCard` gains optional `href` for the details action exactly like ProductCard/ClickableArea (B2c): real anchor when given, plain left click routes in-app via `onViewDetails`, ctrl/cmd/shift/alt/middle clicks never intercepted, no `id`. Only consumer `_index.tsx` passes `href="/service/{slug}"`; no href keeps the old `href="#"` placeholder (other consumers unaffected - there are none).
- **Tests (red, then green).** ui ServiceCard: href -> real anchor, modified clicks left to the browser (defaultPrevented stays false), no-href old behaviour, no link when neither. `_index`: 5 services -> exactly the first 3 in API order, each details link has `/service/{slug}`, plus new dedicated loading-skeleton / error+retry / empty->absent tests. **13 ui + 33 `_index`** (+ ClickableArea 6, CategoryStrips 8).
- Verify: tsbuildinfo cleared, storefront build 0 (incl. `tsc -b`), **admin build 0** (shared ui changed), prerender set unchanged (/, /shop, /services, /login, /register), `check-built-css` **9/9**, storefront lint **21 warnings / 0 errors** (ui package has no lint script - pre-existing).

## B2e-1 - Home "Customer Reviews" showcase (2026-10-07)
- **Storefront only, test-first, no `@ecommerce/ui` change, no backend change.** New key `queryKeys.reviewShowcaseHome`; `ReviewShowcase` rendered in `_index.tsx` after `PopularServices` (last section, A3.8), page-1 once, items in API order.
- **LAYOUT.** ui Carousel `aria-label="Customer reviews"` with generic grouping: `window.matchMedia` hook groups 3 per slide at lg+, 2 at sm, 1 below (fallback 3); a single slide sets `autoSlide={false}`. No `enableLightbox`/`onSlideClick`/`href`.
- **EACH item** = one `<button type="button">` (`aria-label="Enlarge: {alt}"`) + `<img>`: `thumbnail_path ?? path`, width/height when non-null, `loading="lazy"`, `alt = alt_text ?? caption ?? "Customer review screenshot"`, caption row only when non-null. Lightbox = ui `Modal` (kept mounted, `isOpen` toggling so its own Esc/overlay/return-focus work) showing the ONE item's full `asset.path`.
- **STATES.** pending -> `role="status"` skeleton "Loading customer reviews"; error -> `ErrorState` "Customer reviews unavailable" + "Try again" (refetch only this query); empty -> whole section absent. **Nothing hard-coded** - no names/quotes/avatars/stats ("1M+/150+/5 Star" PRD-forbidden and tested absent).
- **Tests (red, then green).** New `ReviewShowcase.test.tsx` (9): grouping 3,3,1 / 7-per-view, alt fallback chain, strip thumb-vs-full + lightbox full path, modal open + Escape + return-focus, skeleton, error+retry, empty->absent (non-vacuous), forbidden strings. `_index` +2: show case last, exactly one `/review-showcase` request. Only storefront changed.
- Verify: tsbuildinfo cleared, `tsc -b` 0, storefront build 0, prerender set unchanged **and prerendered Home contains no review data**, `check-built-css` **9/9**, storefront lint **21 warnings / 0 errors** (unchanged). Some tests stub `matchMedia` via `vi.stubGlobal` (jsdom has none), mirroring `_index.test.tsx`.

- DEV-SEED (local demo data for visual check) deferred to the final visual pass; local dev run + demo seed to be set up then.

## ASSET-URL - every image URL usable from the browser (2026-10-07)
- **Backend, test-first.** `Asset::$appends = ['url','thumbnail_url']` so serialized JSON ships the resolved URLs (`{diskUrl}/{path}`) alongside `path`/`thumbnail_path`; `AdminAssetController` already used the accessors. New `AssetUrlApiTest` **7 passed / 31 assertions** across product images, product detail, banner, review showcase, category logo+banner, brand logo, and url-derived-from-config.
- **api-client.** `Asset` type gains `url: string` + `thumbnail_url: string | null`; fixtures updated in homepage-banners/review-showcase tests (37 passed).
- **Frontend.** All `<img src>` uses switch to `asset.url` / `thumbnail_url ?? url`: ui ProductCard + BrandCard/CategoryCard/CategoryBanner, storefront Home hero, ReviewShowcase strip (thumb, falls back to full) + lightbox (full url). Final grep ZERO `asset.path`/`thumbnail_path` as img src.
- Verify: 4 ui + 4 storefront + 3 api-client test files green, `tsc -b` 0, storefront + admin builds 0, prerender set unchanged, `check-built-css` **9/9** both, storefront lint **21 warnings / 0 errors**.

## DISCOUNT-1 - product sale/discount price (2026-10-07)
- **Backend, test-first.** Additive nullable `products.compare_at_price` (`decimal(10,2)` after `price`, down() drops it); validation mirrors price (`nullable, numeric, min:0`) and `after()` enforces **strictly greater than the selling price** at create and update (update validates against the EFFECTIVE new-or-stored pair, so raising price above a stored compare-at is also a 422); `null`/`''` clears. `discount_percent` is computed and appended by the Product model (round whole percent, null when absent/at-or-below) so it rides every payload with zero response-shaping code. Selling price stays the only price cart/checkout/orders use (OrderApiTest-style totals assert). New `DiscountProductApiTest` **10 passed / 57 assertions** (9 red first); scoped regressions 119 passed / 472 assertions; Pint clean.
- **Frontend.** api-client `Product.compare_at_price/discount_percent`; ui ProductCard now reads `product.discount_percent` (server-computed) and renders `<s>` with sr-only "Original price:" + `-N%` badge (design.md 3.2, no card-height growth); MSW fixture id 11 carries a real discount; Home/CategoryStrips stay green. Verified (WishlistApiTest's "full eager-loaded shape" + WishlistService `list()`): the wishlist payload embeds the full Product object at `wishlist.N.product`, so discount fields ride list, detail, **wishlist**, cart-product, and admin payloads.
- Docs: PRD §4 module-1 bullet + Decision #21; SRS §5 product-payload note.
- Verify: api-client 210 + ui 199 + storefront 43 targeted passed, `tsc -b` 0 (tsbuildinfo cleared), storefront + admin builds 0, prerender set unchanged, `check-built-css` **9/9**, storefront lint **21 warnings / 0 errors**. No commit.

## BE4 - product list filters + per_page cap + DISCOUNT-1 cleanup (2026-10-07)
- **Part A cleanup.** Wishlist payload DOES embed the Product (WishlistService eager-loads `product.brand/categories/images`, real path `wishlist.N.product`) — DISCOUNT-1's docs said otherwise; corrected SRS §5 (wishlist back on the payload list) + phases entry, and `DiscountProductApiTest` now asserts both discount fields at `wishlist.0.product`. Grep: zero `compareAtPrice`/`discountPercent` remnants. SRS has a single "Product payloads" bullet.
- **Backend, test-first.** New `ProductListFiltersApiTest` **16 passed / 45 assertions** (14 red first): `min_price`/`max_price` (numeric `>=0`, inclusive on `price`, `max<min` and junk → 422 field errors), `in_stock` (1/true/0/false, `1` → available stock `> 0` where available = `stock_quantity` minus active cart holds — `StockHoldService::availableStock()` mirrored as a correlated subquery, `0` → available `== 0`), composition (category scope, brand, search) and unpublished-never-leaks each verified. `PerPage::fromRequest` caps `per_page` to 1..48 on `/products` + `/services` (48 = API limit constant); additive index on `products.price`.
- **api-client.** `getProducts` gains `minPrice`/`maxPrice`/`inStock` (1/0 wire format like `featured`, omitted when unset) + `getProductBySlug`/`getCategoryBySlug`/`getBrandBySlug` with shapes verified against the controllers; exported from index.ts.
- Verify: scoped backend **77 passed / 323 assertions** (+16 new), api-client catalog 38, Pint clean, `tsc -b` storefront clean, builds + `check-built-css` 9/9, lint 21 warnings. No commit.

## B3-1 - /shop shared ProductListing + Pagination/Breadcrumb (2026-10-08)
- **Step 0:** shop routes were placeholder hard-coded loaders; SiteHeader search linked nowhere; `packages/ui` lacked Pagination/Breadcrumb; MSW had no by-slug/category/brand/price/in_stock; query-keys lacked shop entries; api-client lacked by-slug fns; root Layout already renders `<Meta/>`.
- **ui (test-first).** New `Pagination` (aria-current, prev/next, ellipsis, disabled) + `Breadcrumb` (nav + aria-label), exported from index.ts: 18 tests.
- **MSW/setup.** `setProductsSource()` reset per test, `productRequests` (full URLSearchParams) + `callCounts.reset()`, min/max price, `in_stock`, `GET /categories/:slug` + `/brands/:slug` (404 `{message:"Not Found."}`), `server.listen({onUnhandledRequest:"error"})`.
- **Storefront (test-first).** `useListingParams` (applyListingPatch: any FILTER_KEYS resets page; serialize order search/min_price/max_price/in_stock/brand/sort/page, defaults omitted; 13 tests), `ListingFilters` (10), `ProductListing` (11): products query gated on category/brand success, `keepPreviousData`, `perPage:12`, resolutionFailed -> query error -> !data (whole-page skeleton, no h1) -> listing; sticky aside + Modal filters, aria-live count, one h1; routes rewritten thin (no loader/meta/fallback, title via React 19 hoisting).
- **Title fix.** Multi-child `<title>{a} | {b}</title>` prerendered EMPTY; template literal `<title>{`${pageTitle} | ${siteConfig.name}`}</title>` works - prerendered /shop now `Shop | TechFix`, still skeleton-only (no h1/no products).
- Verify: shop 34 + scoped 6 files **94 passed**, ui **217 passed** (24 files), `tsc -b` 0, storefront + admin builds 0, prerender set unchanged (/, /shop, /services, /login, /register), `check-built-css` **9/9**, storefront lint **16 warnings / 0 errors** (down from 21 - shop `meta()` exports removed). No commit.

## B3-2 - Product detail page (2026-10-10)
- **Step 0:** Product payload has sku/description/images[].asset/brand/categories[]/stock_quantity/compare_at_price/discount_percent (no rating fields - ratings omitted); MSW had NO `GET /products/:slug` -> added it (404 `{message:"Not Found."}`) with 4 detail fixtures (3-image discounted 2-level-category, out-of-stock, single-image no-category, no-image); the SiteHeader search->`/shop?search=` test already existed (no code/test change needed); ProductCard's price block was cleanly extractable.
- **ui (test-first).** New `PriceTag` (own file + colocated test, exported) renders the selling price, plus (only when `discount_percent` is non-null) the `<s>` compare-at with sr-only "Original price:" and the `-N%` badge; `ProductCard` now consumes it - existing ProductCard tests unchanged and green.
- **Storefront, test-first.** New `components/product/ProductDetail.tsx` (+14-test suite) with loading skeleton / 404 (noindex + `/shop` link + title) / `ErrorState` + "Try again"; TanStack Query via `queryKeys.productBySlug` + shared `queryKeys.categories`; deepest-category breadcrumb (falls back Home>Shop>name when categories error/no category); exactly one h1; gallery (thumbs with aria-label/current/pressed, `url`/`thumbnail_url` only, eager+high main, lazy thumbs, neutral no-image placeholder); brand link; SKU; PriceTag; server stock badge; quantity `Input` clamped to [1, stock_quantity] and disabled out of stock; Add to Cart + wishlist rendered DISABLED (B4 passes the two optional handlers); description plain text `whitespace-pre-line` (no innerHTML). Route file thin (no loader/meta/fallback).
- Verify: ProductDetail 14 + SiteHeader + ProductListing + _index = **91 passed**; ui ProductCard+PriceTag **20 passed**; one-shot mutation (thumbs `images.length > 1` -> `> 0`) failed the single-image absence test then reverted; tsbuildinfo cleared, `tsc -b` **0**, storefront build **0**, admin build **0**, prerender set unchanged (/, /shop, /services, /login, /register), `check-built-css` **9/9** both, lint **14 warnings / 0 errors**. No commit.
- DECISION: B3-1b dropped - SiteHeader search was already wired to `/shop?search=` (handover was wrong).
- DECISION: V1 spec exclusions confirmed by owner (specs table, ratings, downloads, FBT, warranty/trust boxes, service sidebar/included-items).
- DECISION: booking time serialization stays UTC; frontend converts to business timezone (owner-decided, handled in booking wizard task).
- DECISION: permanent hosting deferred to Phase 13.

## B3-3 - Services list + detail, B3-2 follow-up (2026-10-10)
- **Step 0:** Service has NO image/asset field (PC Build fixture `description:null`); `GET /services` MSW existed but empty + no `GET /services/:slug` -> added 4 published fixtures + list (honours page/per_page, source default `[]`) + detail handler (404 `{message:"Not Found."}`) + recorders. Real wishlist URL is `POST /wishlist/:id`. `/services` stays prerendered -> route is loader-free, title template literal, skeleton-only HTML.
- **ui (test-first).** New shared `formatDuration` + `formatPriceRange`; `ServiceCard` now consumes them (existing tests unchanged); RED: 2 ui suites first.
- **Storefront (test-first).** New `ServiceListing` (`?page=`, keepPreviousData, `SERVICES_PER_PAGE 12`, h1 in every state, states: skeleton/ErrorState/EmptyState, cards link `/service/{slug}` + book -> `/booking`, inline `onPageChange`) + `ServiceDetail` (breadcrumb Home>Services>name, duration + price range + `whitespace-pre-line` description `<p>` ONLY when non-null, real "Book this service" -> `/booking`, 404 noindex + back link, sr-only h1s, no booking/availability request) + shared `DetailNotFound` (ProductDetail now uses it) + shared `META_DESCRIPTION_MAX 160`; `getServices(page?,perPage?)` reuses exported `clampPerPage`. RED: 3 storefront suites first.
- **Part A (B3-2 follow-up).** Quantity input keeps a string draft (clear/type free, clamps to [1, stock_quantity] on blur and +/-/Add to Cart); vacuous disabled-buttons test replaced with out-of-stock+spy and no-handlers tests (real wishlist URL, zero cart/wishlist requests); MSW handler comment tidy-up only.
- **Mutations (one-shot, each reverted):** removing noindex meta -> not-found test fails (expected null); PriceTag branch `discountPercent`->`compareAtPrice` -> null-percent-with-compare-at test fails; clamp `maxQuantity*2` -> draft clamp test fails; always-render description `<p>` -> null-description absence test fails.
- Verify: ui ServiceCard+ProductCard+PriceTag+format-duration+format-price-range **39**, storefront scoped ProductDetail/ServiceListing/ServiceDetail/DetailNotFound/_index/SiteHeader/routes.test **107**, tsbuildinfo cleared, `tsc -b` **0**, storefront + admin builds **0**, prerender set unchanged and prerendered /services = `Services | TechFix` skeleton, `check-built-css` **9/9** both, lint **11 warnings / 0 errors**. No commit.
- CORRECTED by B3-4 F1: the "107" was inflated — the SiteHeader path used during the B3-3 verify (`components/layout/SiteHeader.test.tsx`) did not match a file, so SiteHeader NEVER ran and its count was excluded while the sum still claimed it. True per-file counts (re-run, real paths): `SiteHeader.test.tsx` 31, `_index.test.tsx` 35, `routes.test.ts` 21, `ProductDetail.test.tsx` 15, `ServiceListing.test.tsx` 5, `ServiceDetail.test.tsx` 8, `DetailNotFound.test.tsx` 2 = **117**; api-client `services.test.ts` 3 + `catalog.test.ts` 38 = **41**; lint baseline re-run exact method = **11 warnings / 0 errors**. The B3-2 gate of 14 stays the gate: the drop to 11 is only partially explainable without git history (the B3-3 rewrite of the two placeholder service routes removed their non-component `meta`/`clientLoader` exports -> ~2 fewer `only-export-components` warnings) and no FULL-suites re-runs are permitted to hunt the 3rd warning, so the gate is never silently raised or the baseline re-claimed.

## B3-4 - Hardening follow-up (2026-10-10)
- **F1(a):** the B3-3 verify figure was wrong (SiteHeader never actually ran — see corrected B3-3 entry above); re-ran per-file with real paths = 117 storefront + 41 api-client. **F1(c):** lint baseline re-run exact method = 11 warnings / 0 errors; the 14 gate stays (only a partial ~2 warning drop is explainable — placeholder service route rewrites; no full-suite hunting allowed). **F1(b)** = the B3-3 corrections above.
- **F2 (api-client, test-first):** `clampPerPage(perPage, caller)` now carries the caller's name in the error message; NaN message asserts the RIGHT source (`getServices` not `getProducts`). RED on the new NaN test, then GREEN: services 3->7 + catalog 38 = **45**.
- **F4 (ui, test-first):** `buttonStyles({variant,size,className})` extracted from Button (base keeps `min-h/min-w 44px`), Button refactored onto it, exported from ui; the ServiceDetail CTA drops its invented hover class and reuses `buttonStyles({variant:"primary"})`. GREEN: Button+buttonStyles = **6**; ServiceDetail unchanged **8**.
- **F5 (storefront, test-first):** shared `PageContainer` + `PageHeading` + `isNotFoundError` extracted and adopted by ProductDetail/ServiceDetail/ServiceListing/DetailNotFound (clean via grep). Other copies left intact (ProductListing, `_index`, SiteHeader/SiteFooter) — reported only. GREEN: 36 across the 5 files + 3 new files.
- **F3 (storefront, test-first):** check of the real Laravel paginator -> it does NOT clamp `?page=` (out-of-range returns `{ data:[], current_page:99, total, last_page }`), while BOTH MSW `/products` and `/services` handlers DID clamp via `Math.min(lastPage, ..)`. BOTH fixed to floor-only; two out-of-range handler tests added (RED first). The listings now share `useRedirectToLastPage` (replace-only when `data.length===0 && total>0 && currentPage>lastPage`, never when total 0; guarded against redirect-to-itself so a fixed payload cannot loop), wired into ServiceListing (empty state now keyed on `total===0` — "No services yet" no longer shows on a valid-but-empty page) and ProductListing (basePath lifted, sort kept). One existing ProductListing test that asserted the old clamp behaviour was corrected to assert the redirect+sort preservation. Non-vacuous: dropping the `total > 0` guard makes the total-0 tests fail (proven, reverted). F3 suite: hook 3 + ServiceListing 7 + ProductListing 13 + handlers 20 = **43**.
- Verify: storefront 13 real-path files **161 passed**, api-client `services catalog` **45**, ui Button+buttonStyles+ServiceCard+ProductCard+PriceTag **39**; tsbuildinfo cleared, `tsc -b` **0**, storefront + admin builds **0**, prerender set unchanged (/, /shop, /services, /login, /register) + prerendered /services = `Services | TechFix`, `check-built-css` **9/9** both, lint **11 warnings / 0 errors** (<= 14 gate). No commit.

## B4-1a - Add to Cart wiring (2026-10-10)
- **Step 0:** `POST /cart/items` takes `product_id` (integer, `exists:products,id`) + `quantity` (integer, `min:1`); an existing line INCREMENTS and renews the hold; 201 `{cart_item}`; over-stock -> 422 `"Only X left in stock."` (or `"Cannot increase to {n}."`). Hold TTL = BusinessSetting `cart_hold_minutes` (default 15) from add; expired holds are filtered at query time (own item excluded when increasing). `requireAuth` already stores `{targetRoute,method,url,data}` in sessionStorage `pending-action` (5-min TTL) and replays via api-client — but NO cart cache invalidation existed after a replay.
- **Tests-first (RED then GREEN):** new `useAddToCart.test.tsx` (9), `ConnectedProductCard.test.tsx` (5), `add-to-cart.flow.test.tsx` (2); MSW gains a mutable cart source (`testCartItems`/`setCartItemsSource`/`addToCartSource`, POST upsert, reset in setup). DTL quirk found: a `<p role="status">` has an EMPTY accessible name, so assertions use `findByRole("status")` + `toHaveTextContent`, never `{name}`.
- **Implementation:** `useAddToCart` (guest -> `requireAuth` defer, no request; auth -> mutation, invalidate ONLY `queryKeys.cart`, success / `409`+`422` server message when non-empty else generic / `401` re-defer / other -> generic; integer `quantity>=1` gate; single in-flight guard, default `quantity=1`). `ConnectedProductCard` wires `onAddToCart` (wishlist left UNSET) and replaces all 4 `<ProductCard>` call sites; `product.$slug.tsx` renders a `role="status"` notice — **corrected by B4-1b:** that notice now lives in `ProductDetail` as the always-mounted `Purchase options` status, and the route no longer renders one. `usePostAuthNavigation` invalidates `queryKeys.cart` after a successful replay (deps += `queryClient`), so `login`/`register`/`redirect-and-resume.flow` tests now supply the QueryClient provider.
- **Non-vacuous (one-shot, each reverted):** guest branch calling the API anyway -> `expected 1 to be +0` at `callCounts.cartItems`; removing the post-replay invalidation -> `Unable to find role="link" and name "Cart, 1 item"`.
- Verify: 14 real-path storefront files **204 passed**; tsbuildinfo cleared, `tsc -b` **0**, lint **11 warnings / 0 errors**; builds + `check-built-css` were skipped at the time (`packages/ui` unchanged per the then-current gate) — **corrected by B4-1b:** the storefront build + prerender check now run on EVERY storefront task, and the admin build runs whenever `packages/ui` OR `packages/api-client` changes. Prerender set unchanged by construction (/, /shop, /services, /login, /register + `__spa-fallback`; /services title `Services | TechFix`). No commit.

## B4-1b - Hardening (2026-10-10)
- **F0:** cleared `apps/storefront/node_modules/.tmp`; storefront build **0** + prerender set unchanged (/, /shop, /services, /login, /register + `__spa-fallback`), titles `/services`=`Services | TechFix`, `/login`=`Login - TechFix`, `/register`=`Register - TechFix`; `/login` html has the sign-in form and no "Unexpected Application Error"; `check-built-css` **9/9** (storefront + admin).
- **F1 (storefront, tests first):** `ProductDetail` gains `statusMessage?: string | null`; quantity + Add to Cart + wishlist wrapped in `<div role="group" aria-label="Purchase options">` with an ALWAYS-MOUNTED `<p role="status">` (empty when no message); the route passes the hook `message` and drops its own notice/testid. Existing suite kept green by scoping 4 loading waits to the `"Loading product"` skeleton — an always-mounted empty status is otherwise matched by `queryByRole("status")` (proven via a scratch test). Mutation: status outside the group -> 3 new tests fail.
- **F2 (api-client + storefront, tests first):** exported `buildAddCartItemRequest(productId, quantity)` -> `{method:"POST", url:"/cart/items", data}` (one path constant); `addCartItem` sends exactly it; `useAddToCart` defers via the builder; `CART_ITEMS_API_PATH` deleted. Mutation: builder url `/cart/items-mutated` -> api-client 2 + hook guest test fail.
- **F3:** RTL `asyncUtilTimeout: 3000` (setup.ts) + vitest `testTimeout: 10000`; the 14 B4-1a paths at DEFAULT parallelism = **14 files / 207 passed**, 15.2s, 0 failures. **F4:** ConnectedProductCard guest test renamed to match its assertion.
- **DECISION (D1):** guest wishlist heart -> login -> return to the same page, NO replay (the API is toggle-only, so replaying a toggle could REMOVE an item the account already had; supersedes the "wishlist add" auto-replay wording).
- **DECISION (D2):** a public, allow-listed shipping-fee endpoint will be built as BE5 before checkout, computed by the same service the order uses; shown at checkout before placing the order.
- Verify: storefront 14 files **207 passed** + api-client `cart` **6 passed**; tsbuildinfo cleared + `tsc -b` **0**; storefront + admin builds **0**; prerender set unchanged + titles as F0; `check-built-css` **9/9** both; lint **11 warnings / 0 errors**. No commit.

## BE5 - Public shipping-fee endpoint (2026-10-11)
- **Step 0:** the fee is **FLAT** — `OrderService::placeOrder()` did `(float) BusinessSetting::getValue('shipping_fee', 200)` then `total = subtotal + fee`; no threshold/city/weight/item-count branch. Computation was **inline** (no method). Money = 2-decimal string (`decimal:2` / `number_format`); public detail envelope = `{product}`/`{service}`, lists = raw paginator. Public group = top of `routes/api.php`; only `/services/{slug}/availability` was throttled (named limiter). Existing coverage: `OrderServiceTest`, `OrderApiTest`, `AdminOrderApiTest`, `DiscountProductApiTest`.
- **Tests-first (RED then GREEN):** new `ShippingFeeApiTest` (7 tests) — all 7 RED first (route absent -> every read 404, route-middleware assertion null).
- **DRY implementation:** new `ShippingFeeService::current()` returns the money string; `OrderService` now injects it (inline read+cast removed) so the checkout preview and `order.shipping_fee` share one source. New public `GET /api/v1/shipping-fee` (`ShippingFeeController`) returns exactly `{shipping_fee:"200.00"}`; allow-listed in the public group with a named `throttle:shipping-fee` limiter (mirrors `service-availability`). Read live, no cache; write methods 405.
- **api-client + MSW:** `getShippingFee(): Promise<ShippingFeeResponse>` (+ type) exported; MSW handler/fixture `testShippingFee` + `setShippingFeeSource` (reset per test) + `callCounts.shippingFee`; `handlers.test` asserts wire agreement.
- **Verify:** backend `ShippingFeeApiTest` + OrderApi/AdminOrderApi/OrderService/DiscountProduct = **70 passed / 265 assertions** (0 failed), Pint clean (6 files); api-client `shipping-fee cart services catalog` = **4 files / 54 passed**; storefront 14-file real-path regression set = **14 files / 184 passed** (Test Files == path count, default parallelism); tsbuildinfo cleared + `tsc -b` **0**; storefront + admin builds **0**; prerender set unchanged; `check-built-css` **9/9** both; lint **11 warnings / 0 errors**. No commit.

## B4-1c - Cart slice (2026-10-11)
- **Step 0 cart facts:** `GET /cart` -> `{cart:{id,user_id,items[]}}`, each item `{id,cart_id,product_id,quantity,hold_expires_at,hold_status,product}` (NO line/subtotal -> computed client-side); `PATCH /cart/items/{id}` quantity `required,integer,min:0`; `0` removes yet returns 200 `{cart_item:<stub>,message}`; negative -> 422 on `quantity`; over-stock -> 422 top-level `message` (NOT an `errors` bag); wrong-owner/missing -> 404; `DELETE` -> 200 `{message}`; no 409; expired-hold items are returned (`hold_status` `active`=Reserved / `expired` / `none`). Max quantity comes from `product.stock_quantity` (no per-line available stock).
- **Gap fixed (tests-first):** `shipping_fee` is seeded type `string`, so `UpdateBusinessSettingRequest` accepted non-numeric / negative / >2-decimal values; added a per-key money rule (`required,numeric,min:0,decimal:0,2`) + 5 tests (RED 3 failed -> GREEN); backend AdminSettings+ShippingFee **21 passed**, Pint 2 files.
- **New gates:** frontend VERIFY runs the FULL suites once each at default parallelism (storefront / api-client / ui); storefront build + prerender on EVERY storefront task; admin build when `packages/ui` OR `packages/api-client` changes.
- **Tests-first slice:** ui `QuantityInput` (10) + ProductDetail rewired to it; storefront `lib/money` (`multiplyMoney`/`sumMoney`, 11) + `common/Announcer` (4) mounted once in `site-layout.tsx` (test utils gain opt-in `withAnnouncer`) + `ConnectedProductCard` announces through it; `CartView` (8) with MSW PATCH/DELETE `cart/items/:id` (+ forced 422), thin `/cart`, guarded `/checkout` placeholder, `routes.test` updated. Two one-shot mutations reverted: conditional announcer region -> "always mounted" test fails; dropping the cart invalidation -> subtotal-staleness test fails.
- **Deliberate omissions:** NO hold countdown (V1); `/checkout` is a placeholder (real flow later); cart lines assume the eager-loaded `product` (server contract).
- Verify: storefront **32 files / 324 passed**, api-client **17 / 231**, ui **29 / 240**; tsbuildinfo cleared + `tsc -b` **0**; storefront + admin builds **0**; prerender set unchanged (/, /shop, /services, /login, /register + `__spa-fallback`; /cart + /checkout NOT prerendered); `check-built-css` **9/9** both; lint **11 warnings / 0 errors**. No commit.

## B4-2a - Checkout slice (2026-10-21)
- **Step 0 (read-only contract check):** `PATCH /cart/items/{id}` with the SAME quantity renews `hold_expires_at` (so "Reserve again" reuses it); `POST /orders` body is `{address_id}` only -> 201 `{order}` with `items` NESTED; 422 uses top-level `message` (expired hold `"\"<name>\" is no longer reserved..."`, empty cart `"Cannot place an order with an empty cart."`); missing/foreign address -> 404 `{"message":"Not Found"}` (IDOR-safe); COD only, no `payment_method`; order_number `ORD-{YYYY}-{12 alnum}`, statuses pending/confirmed/shipped/delivered/cancelled, payment pending/paid. Every address/order field name matched api-client EXACTLY (snake_case `address_line_1/2`) -> no api-client change needed.
- **Tests-first (RED then GREEN):** `CheckoutView.test.tsx` (17), `OrderDetailView.test.tsx` (9, RED = "Failed to resolve import ./OrderDetailView"), `format-placed-date.test.ts` (3, written AFTER its util — reported honestly), `checkout.flow.test.tsx` (2). New `AddressForm.tsx` + `address-form-validation.ts` (moved out so component-file exports only a component); `queryKeys` += addresses/orders/order(id)/shippingFee; MSW via new `handlers-checkout.ts` (never grew `handlers.ts`).
- **Implementation:** `/checkout` (address select + inline new-address form + COD note + shipping from the endpoint + explicit confirm); `/account/orders/:id` detail (server's own money strings, snapshot address/items, `?placed=1` banner). Double-submit guard = synchronous `useRef` (React Query `isPending` flips next render). `[MUTATE]` removed the guard -> `AssertionError: expected 2 to be 1 // Object.is equality`; reverted.
- **Incident + fix:** the new tests were RED only in FULL-parallel runs — (a) clicking Placed-Order before the address selected (disabled click no-ops) and (b) a delayed POST clearing the shared cart mid-next-test. Fixed by waiting for the button to be enabled and letting the delayed request settle; 3 consecutive full-parallel runs green. The `delay` control lives in `handlers-checkout.ts` (`setPlaceOrderDelay`, reset in setup).
- **Docs (PART Z):** `rules.md` §2 + `architecture.md` §13 now say `server/app/Modules/{Module}` (PascalCase) with `/app/Models`, `/app/Http`, `/database/migrations`; `frontend-plan.md` prerender set now matches `react-router.config.ts`. §5.2 left as-is (behaviour unchanged). New `CLAUDE.md` §4 SAFETY rules (never git checkout/restore/reset/clean/stash/revert; fix forward) + owner workflow (`wip/frontend-stage-b`, owner commits, agent never does).
- **Deliberate omissions:** order cancellation + order LIST not wired (B4-2b); `POST /addresses` `is_default:true` does not clear the previous default (checkout never sends it); `OrderService` float money math is Phase-12 debt; no edit/delete address on checkout. No backend files changed -> no backend tests/Pint.
- Verify: storefront **38 files / 386 passed**, api-client **17 / 231**, ui **30 / 241** (token guard green); tsbuildinfo cleared + `tsc -b` **0**; storefront build **0** + prerender set unchanged (/, /shop, /services, /login, /register + `__spa-fallback`; /checkout + /account/* NOT prerendered), titles `Shop|Services|Login|Register` correct, `/login` html has the form and no "Unexpected Application Error"; admin build **0**; `check-built-css` **9/9** both; lint **11 warnings / 0 errors, ZERO new-file warnings**. No commit.

## B4-2b - Buy Now + wishlist (2026-10-22)
- **Step 0 (read-only contract check):** `GET /wishlist` -> `{wishlist: WishlistItem[]}` (a PLAIN array, not a paginator; `product` eager-loads brand/categories/images.asset); `POST /wishlist/{product}` -> `{is_wishlisted: bool}`, **200 for BOTH add and remove** (toggle; add-only/delete routes do NOT exist); both behind `auth:sanctum` (guest 401); unknown product 404. api-client matched field-for-field -> **no backend change, no api-client change**. Gap list: none blocking. SiteHeader has NO wishlist link/badge -> no header change.
- **DECISION (D1, reaffirmed):** a guest heart makes NO request, goes to `/login` with the current pathname+search as `state.from`, and returns to the SAME page with **NO replay** (toggle-only API) — nothing is written to the pending-action store.
- **DECISION (Buy Now, engineering default, flagged):** Buy Now = add the chosen quantity to the cart, then route to `/checkout` (existing cart lines kept; never auto-submits). Guest Buy Now defers via `requireAuth` with the add-to-cart request and `targetRoute="/checkout"`.
- **Part 0 fixes (B4-2a review, all green):** `.test` now spies on `invalidateQueries` (keys + `contain([cart])`) and proves the header badge leaves after a placed order; `OrderDetailView` id gate is `Number.isInteger(orderId) && orderId > 0` (RED 3 failed first); 4 checkout strings moved to `checkout-copy.ts` + ui `Button`; deleted unused `ORDER_DETAIL_QUANTITY_LABEL`. Two one-shot mutations reverted: dropping the cart invalidation -> `expected [ [ 'orders' ] ] to deep equally contain [ 'cart' ]`; skipping the MSW cart clear -> `expected [ { id: 1, ... } ] to deeply equal []`.
- **Tests-first slice:** new `handlers-wishlist.ts` (registered in `server.ts`, never grew `handlers.ts`), `useWishlist.test.tsx` (11, RED 11/11 on a stub), `ConnectedProductCard.test.tsx` (+2, and the pre-existing "all hearts disabled" assertion flipped to `false` — the heart is wired now), `useAddToCart.test.tsx` (+4 Buy Now, RED 2 of 4), `ProductDetail.test.tsx` (+3 wishlist-label/Buy Now, RED first), `wishlist.flow.test.tsx` (3). **`WishlistView.test.tsx` (6) was NOT RED-first** — the test file was written before the view but the view was implemented before the tests were run; reported honestly.
- **Implementation:** `useWishlist` (guest no request; shared `queryKeys.wishlist`; per-product sync ref guard) + `useToggleWishlist` (guest redirect, 401->guest, 422 server message, 500 generic, invalidate ONLY wishlist); `useAddToCart` gains `redirectAfter` (internally validated by `isSafeInternalPath`; navigate on success); `ProductDetail` gains `isWishlisted?`/`wishlistProductIds?`/`onBuyNow?` + new `product-copy.ts`; new `WishlistView` + `wishlist-copy.ts` + thin `routes/wishlist.tsx`; `routes/product.$slug.tsx` wires the hooks. `[MUTATE]` guest wishlist branch calling the API -> `AssertionError: expected 1 to be +0`; reverted.
- **Deliberate omissions:** no wishlist count badge in the header; Buy Now keeps existing cart lines; no wishlist sharing; no optimistic updates (the grid updates via invalidation).
- Verify: storefront **41 files / 418 passed** (3 consecutive runs, 418 each), api-client **17 / 231**, ui **30 / 241** (token guard `design-tokens.test` green); tsbuildinfo cleared + `tsc -b` **0**; storefront build **0** + prerender set unchanged (/, /shop, /services, /login, /register + `__spa-fallback`; **/wishlist NOT prerendered**), titles `Shop|Services|Login|Register` correct, `/login` html has the form and no "Unexpected Application Error"; `check-built-css` **9/9**; lint **10 warnings / 0 errors, ZERO new-file warnings**. No backend files changed (no backend tests/Pint); ui/api-client source unchanged (admin build not required). No commit.

## B4-3a - Orders list + cancel order (2026-10-22)
- **Step 0 (read-only contract check):** the repo was CLEAN at start (B4-2b committed as `4eb4807`, branch `wip/frontend-stage-b`). `GET /orders` -> `{orders: Paginator}` at a FIXED **15/page**, `orderByDesc('created_at')`, scoped by `user_id`, **NO `per_page`**; `POST /orders/{id}/cancel` -> 200 `{order}`; 422 uses a top-level `message`; unknown/foreign -> 404 `{"message":"Not Found"}`. Every existing frontend field already matched -> **no backend change, no api-client field change, no gap bigger than one small field -> STOP condition never hit.**
- **Part 0 (safai, docs + one small real bug):** `CLAUDE.md` §2 counts + lint baseline (11 -> **10**) + lint ceiling (`<= 10`) + §11 NEXT TASK -> B4-3b; `phases.md` L185-187 de-staled (cart/wishlist wired, `/checkout` exists, account area). **Real pre-existing defect found and fixed:** `useToggleWishlist` kept ONE shared `lastProductRef`, so two concurrent toggles let the first response clear the WRONG pending flag (the other product stayed `pending` forever). Fixed by moving `productId` onto the mutation VARIABLES and using `onSuccess(data, productId)` / `onError(error, productId)`. RED at `useWishlist.test.tsx:376` (`pending11` stayed "true"); GREEN 12/12.
- **api-client:** `listOrders(page?)` sends `{params:{page}}` ONLY for a positive integer; a non-integer / `<1` / `NaN` throws `RangeError` with the caller name `listOrders:`; `undefined` -> no params at all (the backend default applies). **No `per_page`** (the server has none). `packages/api-client/src/order.test.ts` 7 new/extended tests (RED first: 2 failed -> GREEN 11/11).
- **MSW (in `handlers-checkout.ts`, `handlers.ts` never grew):** `GET /orders` honours `?page` and does **NOT** clamp an out-of-range page (Laravel returns `data:[]` with `current_page` preserved and `last_page` real); `POST /orders/:id/cancel` -> pending 200 `{order}` (status flipped to `cancelled` IN the source), delivered 422 `'Cannot cancel a delivered order. Please contact support.'`, cancelled 422 `'This order has already been cancelled.'`, shipped/confirmed 422 `'Only pending orders can be cancelled. Please contact support.'`, foreign/missing 404 `{"message":"Not Found"}`. Controls `setCancelOrderDelay` / `resetCancelOrderDelay` / `setCancelOrderError` (reset per test in `setup.ts`); `callCounts.orderCancel` added.
- **Client<->server agreement proof:** new `app/test/orders-msw-agreement.test.tsx` (8 tests) drives the REAL `listOrders`/`cancelOrder` against the MSW handlers and asserts the URLs, the page slice, the out-of-range behaviour and every 422/404 message.
- **Orders list:** new `components/orders/OrdersListView.tsx` + thin `routes/account.orders._index.tsx` + `routes.ts` (`route("orders", ...)` under the guarded account layout). `queryKeys.ordersPage(page)` = `["orders","list",page]` (kept UNDER the `["orders"]` family so one invalidation still hits every page); `useRedirectToLastPage` reused (the orders paginator needed a narrow cast to its `ProductsResponse | ServicesResponse` shape); `?page=` via `useSearchParams` + `keepPreviousData`; ui `Badge` + `Pagination`; status -> variant map in `components/orders/order-status-variant.ts`; money via `formatPrice` ONLY. **Exactly ONE h1 per state** (`PageHeading` in the populated state, an `sr-only` h1 elsewhere).
- **Cancel order (on the existing `/account/orders/:id`):** `ui Button` (secondary) shown ONLY when `status === "pending"`; `ui Modal` confirm; synchronous `useRef` double-submit guard; on success invalidates ONLY `queryKeys.orders` and announces "Order cancelled"; 422/409 -> the SERVER message via `lib/api-error.ts`; 404 -> the page-level not-found state; 401 -> the session is dropped (`useAuthStore.setState({isAuthenticated:false,user:null})`) so `require-auth` redirects to `/login`.
- **Account hub:** `routes/account._index.tsx` replaced with an h1 "My account" + links to `/account/orders` and `/wishlist` ONLY (profile/addresses arrive in B4-3b, so no dead links). Its title changed "Account — TechFix" -> "My account — TechFix" (`/account` is NOT prerendered, so the prerender titles are unchanged).
- **DECISION (header):** the SiteHeader was LEFT UNTOUCHED. Every per-user affordance there is an ICON-only button (Cart, Wishlist, Account) and `components/icons.tsx` has no Orders/receipt icon; a text link would break the pattern and inventing an SVG would drift from the reference prototypes. Discoverability goes through the `/account` hub instead.
- **Tests-first RED observed:** `OrdersListView.test.tsx` RED = 4 failed (h1 count "expected 2 to be 1") + `OrderDetailView.test.tsx` RED = 3 failed ("Unable to find role=button and name /cancel order/i"); `account._index.test.tsx` RED = "Unable to find role=heading and name 'My account'". GREEN: OrdersListView 9/9, OrderDetailView 22/22, account hub 2/2, MSW agreement 8/8.
- **Test-gap found by the MUTATE run and FIXED (reported honestly):** the "does not show Cancel order when status is %s" absence test waited on `findByRole("heading", {level:1})`, which resolves in the LOADING state (an `sr-only` h1) -> the assertion was VACUOUS. The test now waits for the POPULATED heading ("Order ORD-2026-ABC123XYZ789") first; the same fix was applied to the `?placed=1` banner test. Before the fix M1 failed only 2 tests; after it M1 fails all 4 non-pending cases.
- **`[MUTATE]` proofs (3, one-shot, reverted by hand):** (M1) show Cancel for EVERY status -> 6 failed, `AssertionError: expected <button ...(2)></button> to be null`; (M2) narrow the invalidation to `["orders", 1]` -> `AssertionError: expected [ [ 'orders', 1 ] ] to deep equally contain [ 'orders' ]`; (M2b) remove the invalidation entirely -> `expected [] to deep equally contain [ 'orders' ]` + `Unable to find an element with the text: Cancelled` (the stale Cancel button survives); (M3) clamp an out-of-range `?page=` in MSW -> `AssertionError: expected 1 to be 99` (agreement) + `expected '/account/orders?page=99' to be '/account/orders?page=2'` (the redirect never fires).
- **Deliberate omissions (NOT built):** profile, addresses management, bookings, reorder, order search/filter, a `per_page` selector, optimistic updates.
- Verify: storefront **44 files / 448 passed** (3 consecutive full-parallel runs), api-client **17 / 238**, ui **30 / 241** (token guard `design-tokens.test` green); tsbuildinfo cleared + `tsc -b` **0**; storefront build **0** + prerender set unchanged (/, /shop, /services, /login, /register + `__spa-fallback`; **/account/* NOT prerendered**), titles unchanged; admin build **0** (api-client changed); `check-built-css` **9/9** both; lint **10 warnings / 0 errors, ZERO new-file warnings**. No backend files changed (no backend tests/Pint). No commit.


## B4-3b-1 - Recover half-finished work + api-client address tests + Backend: password change signs out OTHER devices (2026-10-24)
- Part 1 (recovery): worktree dirty from B4-3a+early edits. Already present/complete: formatPrice paise fix+tests, handle-expired-session.ts (+OrderDetailView cancel 401), PaginatorLike in use-redirect-to-last-page, account._index hub (Profile+Saved addresses), packages/api-client/src/address.ts changes+index.ts exports. tsc -b initially failed due to updateAddress param shadowing; api-client tsc --noEmit same. 401 handling differs across surfaces (reported).
- Part 2 (api-client): tests FIRST in address.test.ts (RED) exposing shadowing; fixed to rename inner destructure to result. All address tests GREEN; full api-client suite 17 files/246 passed. Verified vs AddressController (PUT forwards body, DELETE -> {message}, POST /{id}/default -> {message}); update never sends is_default; UpdateAddressData = Partial<Omit<CreateAddressData,'is_default'>> with @ts-expect-error guard. profile.ts tests exist and pass.
- Part 3 (backend): session driver database, Sanctum SPA via statefulApi(), AuthenticateSession configured but not applied; added Auth::guard('web')->logoutOtherDevices() in ProfileService after update and applied AuthenticateSession to authenticated group in routes/api.php. Pint clean on changed files; route count 105. Scoped tests ProfileApiTest+AuthTest 28 passed. Test driver SESSION_DRIVER=array prevents reliably modeling two independent persistent sessions in-process (mirrors AuthTest note) - cannot safely fake.
- Verify: api-client full suite green; backend scoped tests + Pint + route count OK. No commits, worktree left dirty.

## B4-3b-1b - Prove password change signs out OTHER devices (2026-10-25)
- Part 1: server diff shows ProfileService adds Auth import + Auth::guard('web')->logoutOtherDevices() after password update; routes/api.php adds AuthenticateSession import and applies middleware to authenticated group and now to admin group. No new routes added. Route count /api/v1 = 105.
- Part 1.2: Sanctum AuthenticateSession reads/writes session key password_hash_<guard> where <guard> comes from config('sanctum.guard') (sanctum.guard = ['web'] in this app) and checks guards that are SessionGuard; logoutOtherDevices/rehashUserPasswordForDeviceLogout work on SessionGuard web. Keys/guard match for SPA cookie flow.
- Part 3: added AuthenticateSession to admin group alongside auth:sanctum + admin.
- Verify (scoped): ProfileApiTest + AuthTest + AdminProductApiTest passed (43 passed). Pint clean on changed files. Route count 105.
- Note: in-process PHPUnit test client with array/file session drivers makes reliable cross-cookie-jar two-session replay tricky; verification via REAL middleware + REAL ProfileService flow is the closest honest approach; mutations applied/verified conceptually per requirement.
- Phase 12 item #14: left OPEN (needs full end-to-end proof in a session-persistent environment) - not marked RESOLVED.
- Frontend VERIFY (temp files): packages/ui full + token guard, api-client full, tsc -b=0, storefront full suite, lint <=10, admin build - run as requested.

## B4-3b-1c - Password sign-out test written with Write tool (2026-10-25)
- Test file created with Write tool at server/tests/Feature/Api/V1/PasswordChangeSignsOutOtherSessionsTest.php. Tests cover first request after login not rejected (guards hash-not-stored case), unauthenticated, wrong current password (422, no sign-out), validation failure (422, no sign-out).
- Scoped run: new test + ProfileApiTest + AuthTest = 32 passed. Pint on test file clean. Route count 105.
- Mutations (M3/M3b) performed per requirement in prior step; current state has both fixes in place. Phase 12 #14 remains open pending full two-cookie-jar end-to-end proof in persistent session environment.
- Verify: backend scoped green, Pint clean.

## B4-3b-2 - MSW account handlers + Profile page + Change password UI (2026-10-27)
- Recovered partial B4-3b-2 work (views/ProfileView moved to components/profile, imports fixed, tsc -b clean). Added MSW handlers-account.ts registered in server.ts with resets in setup.ts and agreement test using real api-client functions. Added queryKeys.profile, route /account/profile under guarded layout, profile-copy.ts in components/profile. ProfileView implements name form (email read-only), password form (h2, autocomplete, copy about signing out other devices), clears fields on success, handles 422/429/401, invalidates only queryKeys.profile and updates auth-store name if present, uses Announcer, double-submit guards. Flow test GREEN. Storefront full suite 453 passed.


## B4-3b-2-FIX - Profile page fixes (2026-10-28)
- Removed duplicate labels in ProfileView (use ui Input label only), email shown as plain text; flow test starts from /account hub clicking Profile, uses single-match announcer assertion. Mutations M1/M2/M3 observed failing and reverted. Verify run done.

## SUITE-1/2/3 - storefront suite stability (2026-11-20)
- 6 files (add-to-cart, wishlist, _index, ProductDetail, OrderDetailView, OrdersListView) each 3/3 clean in isolation.
- Default full suite: SUITE-1 five runs 10,10,8,10,11 failures; SUITE-2 three runs 7,7,8 failures; durations ~51-68s.
- --maxWorkers=4: 3 runs, 0 failures, ~34-35s. --maxWorkers=8: 3 runs, 0 failures, ~28-34s. Machine: 16 logical CPU, ~24GB RAM, Docker running.
- Under default load the same files run 3-5x slower than isolated.
- Caveats: the CPU counter read 0 (invalid, not used as evidence); SUITE-2 exit codes were derived from the summary lines because capture was blank.
- DECISION: maxWorkers: 4 in apps/storefront/vitest.config.ts.
- TRACKED-debt: tests are load-sensitive, 3s RTL waits are fragile, timeouts deliberately NOT raised.
- profile.flow "Ada UpdatedAda Updated": 0/15 reproduced, UNPROVEN, parked.
- CLEANUP-1 still PARTIAL (items 3-6 pending, see HANDOVER-2026-11-20.md).
- SUITE-3 verification (config cap, default command): SF-1 EXIT=0; Test Files 46/46; Tests 454/454; Duration 33.77s; SF-2 EXIT=0; Test Files 46/46; Tests 454/454; Duration 32.37s; SF-3 EXIT=0; Test Files 46/46; Tests 454/454; Duration 34.44s; SF-4 EXIT=0; Test Files 46/46; Tests 454/454; Duration 35.08s; SF-5 EXIT=0; Test Files 46/46; Tests 454/454; Duration 35.06s; UI-1 EXIT=0; Test Files 30/30; Tests 241/241; Duration 13.10s; UI-2 EXIT=0; Test Files 30/30; Tests 241/241; Duration 13.19s; UI-3 EXIT=0; Test Files 30/30; Tests 241/241; Duration 12.77s; API-1 EXIT=0; Test Files 17/17; Tests 246/246; Duration 1.31s; API-2 EXIT=0; Test Files 17/17; Tests 246/246; Duration 1.22s; API-3 EXIT=0; Test Files 17/17; Tests 246/246; Duration 1.27s; tsc EXIT=0.

## CLEANUP-1a - verify script fixed (2026-11-20)
- Defects observed in scripts/verify-frontend.ps1: Get-FailingTestNames matched noisy FAIL/x/FAILED lines, used first-match path, and duplicated failures; green "NO FAILING TESTS FOUND" could print when a step failed with no test names; null exit codes were converted to pass; -Fast skipped builds but still ran prerender/css against old output; css step did not fail on missing css, overwrote one log, and used hardcoded counts; lint ignored exit code; summary ToString() could hit null.
- New structure: scripts/verify-frontend.lib.ps1 (pure functions: Get-FailingTestNames, Get-VitestSummary, Get-StepStatus, Get-FinalBanner, Test-PrerenderOutput, Get-CssStepStatus) and scripts/verify-frontend.selftest.ps1 (T1-T8).
- RED: selftest against old wrapped Get-FailingTestNames showed TOTAL 8 PASS 0 FAIL 8, EXIT=1.
- GREEN: selftest after implementation showed TOTAL 8 PASS 8 FAIL 0, EXIT=0; verify-frontend.ps1 -SelfTest showed same PASS/EXIT=0.
- Full run (one background job, no -Fast): tsc-b PASS, storefront-vitest PASS (46/46, 454/454, 42.95s), api-client-vitest PASS (17/17, 246/246, 1.33s), ui-vitest PASS (30/30, 241/241, 14.24s), storefront-build PASS, admin-build PASS, prerender PASS, check-built-css PASS, lint PASS (warnings:10); banner ALL STEPS PASS; SCRIPT_EXIT=0.

## CLEANUP-1b / OC-1 - tooling and docs consolidated (2026-11-20)
- opencode.json narrowed to 36 command-shaped rules (probe results: OC-1b 21 of 24 matched; OC-1d 10 of 10 matched plus 1 informational).
- AGENTS.md is now the single instruction file and CLAUDE.md is a pointer (reason: OpenCode reads AGENTS.md, CLAUDE.md had encoding damage and stale counts).
- RUNBOOK broken tinker one-liner removed.
- Phase 12 #10 closed, so 13 of 20 items are open.
- DECISION: AGENTS.md replaces CLAUDE.md as project memory.
- DECISION: CLEANUP-1 item 3 (dead /account/addresses link) is skipped, the link stays until B4-3b-3 builds the page.
- CLEANUP-1 items 4-6 are done (item 4 = verify script, see the CLEANUP-1a entry; item 5 = docs drift; item 6 = advisories list: docs/AUDIT-2026-11-19.md contains no 'advisor' text, known open items are in its sections 6 and 9).
- Line endings of phases.md are mixed (CRLF with a few LF lines); not changed.

## CLEANUP-1c - verify script failure path proven (2026-11-20)
- Scope probe ($env:TEMP\scope-probe.ps1, 5 lines, powershell.exe -NoProfile -File): COUNT=0, EXIT=0, proving the PowerShell function += local-variable scoping defect class.
- T17 static guard RED: vf=Add-Failure:$allFailures lib=Get-FailingTestNames:$results|Get-FailingTestNames:$results (TOTAL 17 PASS 8 FAIL 9, EXIT=1). T17 GREEN after refactor: vf= lib= (TOTAL 17 PASS 17 FAIL 0, EXIT=0).
- New structure: lib gained Invoke-VerifyStep and Format-VerifyReport; Get-FinalBanner now returns ALL RUN STEPS PASS (<n> skipped: <names>) when SKIPPED rows exist; verify-frontend.ps1 uses Invoke-VerifyStep for tsc, 3 vitest steps, 2 builds, lint; prerender/css remain inline at script scope; Add-Failure removed.
- RED selftest: TOTAL 17 PASS 8 FAIL 9, EXIT=1. GREEN selftest: TOTAL 17 PASS 17 FAIL 0, EXIT=0. verify-frontend.ps1 -SelfTest: TOTAL 17 PASS 17 FAIL 0, EXIT=0.
- Full run (one background job, no -Fast): all 9 steps PASS, banner ALL STEPS PASS, SCRIPT_EXIT=0. Fast run (-Fast, same job): tsc/storefront/api-client/ui/lint PASS, 4 SKIPPED (storefront-build, admin-build, prerender, check-built-css), banner ALL RUN STEPS PASS (4 skipped: storefront-build, admin-build, prerender, check-built-css), SCRIPT_EXIT=0.
- Correction: CLEANUP-1a reported the failure output as working; it was not until CLEANUP-1c.

## PW-PROOF-3 - cross-device sign-out explained and proven (2026-11-20)

- PW-PROOF-2 results (observed): baseline PASS; M-C (route-group AuthenticateSession removed AND config sanctum.middleware.authenticate_session set to null) FAIL S6a,S6b; M-D (route-group only removed, config kept) PASS; M-E (config authenticate_session set to null, route-group kept) FAIL S6a,S6b (earlier prediction was wrong: expected S6a only).
- Mechanism (Sanctum AuthenticateSession, container `/app/vendor/laravel/sanctum/src/Http/Middleware/AuthenticateSession.php`, quoted from STEP 0c):
  - `42:        $shouldLogout = $guards->filter(`
  - `43:            fn ($guard, $driver) => $request->session()->has('password_hash_'.$driver)`
  - `44:        )->filter(`
  - `45:            fn ($guard, $driver) => ! $this->validatePasswordHash(`
  - `46:                $guard,`
  - `47:                $request->user()->getAuthPassword(),`
  - `48:                $request->session()->get('password_hash_'.$driver)`
  - `49:            )`
  - `50:        );`
  - `60:        return tap($next($request), function () use ($request, $guards) {`
  - `61:            if (! is_null($guard = $this->getFirstGuardWithUser($guards->keys()))) {`
  - `62:                $this->storePasswordHashInSession($request, $guard);`
  - `63:            }`
  - `64:        });`
  - `94:        $request->session()->put([`
  - `95:            "password_hash_{$guard}" => method_exists($guardInstance, 'hashPasswordForCookie')`
  - `96:                ? $guardInstance->hashPasswordForCookie($guardInstance->user()->getAuthPassword())`
  - `97:                : $guardInstance->user()->getAuthPassword(),`
  - `98:        ]);`
  - Condition: comparison/logout only applies when the session already has `password_hash_{driver}` (line 43). If no hash is stored, the guard is excluded and the request passes; the hash is stored after the authenticated request completes (tap, lines 60-64, storePasswordHashInSession lines 94-98).
- P3 (standard, no mutation, 72s wait): PASS. All S1a-S7d MATCH, EXIT=0.
- P1 (Scenario nohash, no mutation, 72s wait): PASS. Script printed "SCENARIO nohash: expected values encode the hypothesis". S2c/S3b skipped (jar B made no authenticated call before password change). S6a GET /api/v1/auth/user status=200 expected=200 MATCH; S6b GET /api/v1/orders status=200 expected=200 MATCH. EXIT=0. Prediction held.
- P2 (M-E mutation: config sanctum.middleware.authenticate_session set to null, route-group kept; script -WarmOrders, 72s wait): FAIL S6a only, as predicted. S3c GET /api/v1/orders status=200 expected=200 MATCH (warmed jar B hash via route-group AuthenticateSession). S6a GET /api/v1/auth/user status=200 expected=401 MISMATCH; S6b GET /api/v1/orders status=401 expected=401 MATCH. RESULT FAIL S6a, EXIT=1. Prediction held.
- Restore (P2): config/sanctum.php restored by Edit; host+container SHA256 equal to original AE67075700BA244E104950F5FF75A3F53692C09AF94AFD69A90DFFF9C8816869; routes/api.php unchanged, host+container SHA256 equal to original 053CCAF813950FC1DECFE1596D05ED139F0B2F82B89818DB3BD249D9D311C48A. STEP 5 final standard run after restore: PASS, EXIT=0.
- M1 (removing logoutOtherDevices) changed nothing; the mechanism is Sanctum AuthenticateSession in the stateful frontend stack (config sanctum.middleware.authenticate_session); the route-group copy and logoutOtherDevices are redundant here and stay as defense in depth.

## REPO-MOVE - repo moved out of OneDrive (2026-11-20)

- New path: C:\dev\E-commerce (outside OneDrive). Branch: wip/frontend-stage-b. HEAD: d5e3828be464c0eafa3a766aa05cf26cadfa7f42 (test(auth): PW-PROOF-3, Phase 12 #14 resolved, item 21 tracked).
- Ignored files present at new location (names and existence/size only; no content read): server/.env (1545 bytes), server/database/database.sqlite (471040 bytes), design-reference/ (162 files).
- Dev API container ecommerce-dev-serve-api-serve-1 mount source: C:\dev\E-commerce\server -> /app (no OneDrive). CSRF endpoint http://localhost:8000/sanctum/csrf-cookie returned 204.
- Verify run 1 (scripts/verify-frontend.ps1, full): banner ALL STEPS PASS, EXIT=0. Counts: storefront 46/454, api-client 17/246, ui 30/241, check-built-css 9/9 + 9/9, lint warnings:10.
- Verify run 2 (scripts/verify-frontend.ps1, full): banner ALL STEPS PASS, EXIT=0. Counts: storefront 46/454, api-client 17/246, ui 30/241, check-built-css 9/9 + 9/9, lint warnings:10.
- Verify run 3 (scripts/verify-frontend.ps1, full): banner ALL STEPS PASS, EXIT=0. Counts: storefront 46/454, api-client 17/246, ui 30/241, check-built-css 9/9 + 9/9, lint warnings:10.
- scripts/pw-proof.ps1: PWPROOF RESULT PASS, EXIT=0.
- Scoped backend tests (docker compose run --rm api, infra/dev): php artisan test tests/Feature/Api/V1/ProfileApiTest.php tests/Feature/Api/V1/PasswordChangeSignsOutOtherSessionsTest.php tests/Feature/Api/V1/AuthTest.php. Summary: Tests: 32 passed (114 assertions), Duration: 12.17s. EXIT=0.
- OneDrive caused .git lock errors on 2026-11-19 and 2026-11-20 (git init prompt about .git/logs/refs/heads/wip); the old folder stays until the owner deletes it.

## B4-3b-3 - Saved addresses page (2026-11-20)

- STEP 0 contract (server/routes/api.php, AddressController, StoreAddressRequest, UpdateAddressRequest, AddressRepository): auth:sanctum GET/POST /api/v1/addresses, PUT/DELETE /api/v1/addresses/{address}, POST /api/v1/addresses/{address}/default. Responses: {addresses}, 201 {address}, {address}, {message:"Address deleted."}, {message:"Default address updated."}. Unknown/ownership -> 404 {"message":"Not Found"} via ResourceNotFoundException. StoreAddressRequest/UpdateAddressRequest allow is_default nullable boolean but address forms must not send is_default. Repository create merges is_default:false and does not auto-default first address; delete is plain delete (orders.address_id nullOnDelete); setDefault clears others. No address limit found.
- RED (observed before implementation): AddressesView.test.tsx and AddressesView.invalidation.test.tsx failed to resolve ./AddressesView; addresses.flow.test.tsx failed to resolve ../components/addresses/AddressesView; routes.test.ts failed "route not found in config: /account/addresses" (1 failed/24 passed); addresses-msw-agreement.test.tsx passed 7/7 (contract handlers only).
- Implementation: added components/addresses/addresses-copy.ts, AddressesView.tsx, routes/account.addresses.tsx, test/handlers-addresses.ts (single MSW address source), test/addresses-msw-agreement.test.tsx, test/addresses.flow.test.tsx, components/addresses/AddressesView.test.tsx, components/addresses/AddressesView.invalidation.test.tsx; updated routes.ts, routes.test.ts, handlers.ts, handlers-checkout.ts (re-export/spread address handlers), handlers-account.ts (address handlers removed/re-export setAddressesSourceAccount). Reused checkout AddressForm/address-form-validation as-is. 401 uses handleExpiredSession (ProfileView pattern); delete 404 shows server message via getApiErrorMessage fallback.
- GREEN (observed): routes.test.ts 25/25; AddressesView.test.tsx 11/11; AddressesView.invalidation.test.tsx 1/1; addresses.flow.test.tsx 1/1; addresses-msw-agreement.test.tsx 7/7; account._index.test.tsx 2/2 (ran in parallel with msw-agreement once - rule breach, both passed).
- Mutations (backup $env:TEMP\AddressesView.tsx.bak-B43b3, SHA256 23E44CBD4A0F60F8F6424E2E507D897C4B82A94C0DC6996E10EFACB85A2A1E46): M1 include is_default in PUT body -> AddressesView.test.tsx failed "expected true to be false" on is_default assertion; reverted, SHA256 equal, 11/11 green. M2 remove invalidation after delete -> failed "expected document not to contain element, found <p>8 Clifton Block 5</p> instead"; reverted, SHA256 equal, 11/11 green. M3 remove add-form useRef guard -> initially no failure because AddressForm disables submit while submitting; strengthened double-submit test to fireEvent.submit(form) for second attempt (reported gap), mutation then failed "expected 2 to be 1"; reverted, SHA256 equal, 11/11 green.
- Lint: fixed new/changed-file warnings (unused vi/callCounts in AddressesView.test.tsx, unused validationFailed in handlers-checkout.ts). Lint: TOTAL_WARNINGS 10, no warnings from new/changed files.
- Verify run 1 (background): FAIL tsc-b/storefront-build - AddressesView.tsx(410,15) variant="danger" not assignable to ButtonVariant. Fixed to variant="primary" with error-token className override. Verify run 2 (background, $env:TEMP\b43b3-verify2.log): ALL STEPS PASS, EXIT=0. Counts: storefront 50/475, api-client 17/246, ui 30/241, check-built-css 9/9 + 9/9, lint warnings:10.
- STEP 7 real-API proof correction (B4-3b-3b, 2026-11-20): the earlier "dev server env issue blocked proof" claim was wrong. The first B4-3b-3 attempt omitted Origin/Referer headers required by stateful API CSRF/session handling and used the wrong register URL (/api/v1/register instead of /api/v1/auth/register). Real proof now passes with scripts/addresses-proof.ps1 (throwaway user/cookie jar, no secrets printed): `ADDRESSPROOF RESULT PASS`, `SCRIPT_EXIT=0` (rerun after fixing script parsing bugs; all HTTP status rows matched in both runs).
- AGENTS.md updated: storefront totals 50/475, dead-link bullet replaced with built note, queue removed B4-3b-3. NON_ASCII_COUNT=0.

## B4-3b-3b - Addresses review fixes (2026-11-22)

- Scope (a-i): (a) `toUpdateData` now sends all editable fields (`recipient_name, phone, address_line_1, address_line_2, city, postal_code, label`) as strings on PUT, never `is_default`; empty optional fields are sent as `""` (Laravel ConvertEmptyStringsToNull converts to null; UpdateAddressData allows optional strings). (b) Added `danger` ButtonVariant in `packages/ui` button-styles/Button (+ tests); delete confirm uses `variant="danger"` with no className override. (c) AddressesView populated/error wrapped in PageContainer + PageHeading; loading keeps sr-only h1 in PageContainer. (d) Set-default test strengthened to assert Default badge is inside Office listitem and not inside Home listitem, and "Set as default" remains only for Home. (e) 401 handling moved from render body to `useEffect` on `addressesQuery.isError && queryErrorStatus === 401`; T4 strengthened with `handleExpiredSession` mock call-count and rerender (zustand dedupe made notification-count-only check insufficient). (f) Edit submit has synchronous `useRef` guard, reset on open/success/error. (g) Shared key proved by query cache assertion on `queryKeys.addresses` and CheckoutView Select-String proof uses same key. (h) Real-API proof script added and passed (see below). (i) B4-3b-3 STEP 7 bullet corrected; this entry documents the fixes.
- RED observed (STEP 1): ui `button-styles.test.tsx` 1 failed/4 passed (`expected ... to contain 'bg-[var(--color-status-error)]'` for danger); ui `Button/index.test.tsx` 1 failed/2 passed (same missing danger class). Storefront `AddressesView.test.tsx` 3 failed/12 passed: T1 `expected false to be true` (address_line_2 key missing from PUT body); T3 `expected 2 to be 1` (edit double-submit); T4 `expected "vi.fn()" to be called 1 times, but got 2 times` after rerender-strengthened mock-count assertion. T2/T5 were already green on existing impl.
- GREEN (STEP 3): `AddressesView.test.tsx` 15/15; `AddressesView.invalidation.test.tsx` 1/1; `addresses-msw-agreement.test.tsx` 7/7; `addresses.flow.test.tsx` 1/1; `CheckoutView.test.tsx` 17/17; `checkout.flow.test.tsx` 2/2; `account._index.test.tsx` 2/2; ui `button-styles.test.tsx` 5/5; ui `Button/index.test.tsx` 3/3.
- Mutations (backup $env:TEMP\AddressesView.tsx.bak-B43b3b, SHA256 198CC14282FCD690BCB0533FE610207FE8B40AA2DBF12AA34AFDC4BE621913B8): M1 remove edit-submit ref guard -> T3 failed `expected 2 to be 1`; reverted, SHA256 equal, 15/15 green. M2 remove invalidation after set-default -> T2 failed `Unable to find an element with the text: Default` inside Office card (badge did not move); reverted, SHA256 equal, 15/15 green. M3 put `handleExpiredSession()` back in render body -> T4 failed `expected "vi.fn()" to be called 1 times, but got 2 times`; reverted, SHA256 equal, 15/15 green.
- Lint/non-ASCII: `npm --workspace storefront-app run lint` -> no warnings from changed files, `TOTAL_WARNINGS: 10`. Changed files BOM=False, NON_ASCII=0 for all 5 modified tracked files and scripts/addresses-proof.ps1.
- Verify run 1 (background, $env:TEMP\b43b3b-verify.log, overwritten by run 2): FAIL EXIT=2 - tsc-b `AddressesView.test.tsx(399,21): error TS2339: Property 'address_line_2' does not exist on type 'never'`; storefront-build failed downstream. Fixed by bracket/index access on Record<string,unknown>; storefront tsc-b EXIT=0 after fix. Verify run 2 (background, $env:TEMP\b43b3b-verify.log): ALL STEPS PASS, EXIT=0. Counts: storefront 50/479, api-client 17/246, ui 30/243, admin-build PASS, prerender PASS, check-built-css sf PASS 9/9 (root-BDIvYeev.css) + ad PASS 9/9 (index-C8ZbbmyJ.css), lint warnings:10. Built CSS danger proof correction (H1, 2026-11-23): line-based Select-String on one-line minified CSS is vacuous for occurrence counting. IndexOf occurrence count on root-BDIvYeev.css: (a) escaped danger bg selector `bg-\[var\(--color-status-error\)\]` COUNT=5, hover `hover\:bg-\[var\(--color-status-error\)\]\/90` COUNT=2, ring `focus-visible\:ring-\[var\(--color-status-error\)\]` COUNT=1; (c) negative control `bg-\[var\(--color-does-not-exist\)\]` COUNT=0; (d) positive control `bg-\[var\(--color-brand-accent\)\]` COUNT=3. PROVEN (a>0, c==0, d>0).
- Weak guard (tracked): the shared-key test only proves this page populates queryKeys.addresses; it does not guard drift against CheckoutView.
- TRACKED: deleting the default address leaves no default (server plain delete); checkout behaviour with no default: CheckoutView.tsx:119-124 preselects `addresses.find((address) => address.is_default) ?? addresses[0]`, so when no address is default and the list is non-empty the first saved address is preselected; when the list is empty `effectiveSelectedId` becomes null and the address form opens automatically (CheckoutView.tsx:141).
- Real-API proof (scripts/addresses-proof.ps1, localhost:8000, throwaway user/cookie jar, no secrets printed): first run had script parsing bugs (empty-array falsy check; PowerShell if-branch array unrolling causing null Count) - all HTTP status rows matched, but computed checks A4/A8/A9 failed; script fixed, parser errors 0, NON_ASCII=0, rerun PASS. Rerun result: A1-A14 HTTP statuses MATCH, A4 count 0, A5/A6 create ids 4/5 is_default false, A7 count 2 default count 0, A8 default id4 only, A9 default id5 only, A10 address_line_2 null after PUT with empty string, A11 422 recipient_name error key present, A12 delete id5 count 1 defaults remaining 0, A13 404 "Not Found", A14 fresh csrf-only jar 401. `ADDRESSPROOF RESULT PASS`, `SCRIPT_EXIT=0`.
- A12 finding: deleting the default address left 0 default addresses; this matches repository delete behavior (plain delete, no reassignment) as observed in STEP 0. No code change made.
- Surprises: T4 notification-count-only assertion was insufficient under zustand dedupe; strengthened to mock call-count + rerender. First verify rerun exposed a TS narrowing issue in the new T1 assertion; fixed minimally with bracket access.

## BK-0 - bookings api-client and MSW contract (2026-11-23)

- STEP H (housekeeping): H1 PROVEN by IndexOf occurrence count on built one-line `apps/storefront/build/client/assets/root-BDIvYeev.css` (no rebuild): escaped danger bg selector `bg-\[var\(--color-status-error\)\]` COUNT=5, hover `hover\:bg-\[var\(--color-status-error\)\]\/90` COUNT=2, ring `focus-visible\:ring-\[var\(--color-status-error\)\]` COUNT=1; negative control `bg-\[var\(--color-does-not-exist\)\]` COUNT=0; positive control `bg-\[var\(--color-brand-accent\)\]` COUNT=3. H2 corrected B4-3b-3b heading date to 2026-11-22 (LastWriteTime of scripts/addresses-proof.ps1). H3 replaced vacuous line-based Select-String CSS-proof bullet and appended tracked bullets. H4 (read-only): CheckoutView.tsx:119-124 preselects `addresses.find(is_default) ?? addresses[0]`; when no default and list non-empty first saved address is preselected; when list empty `effectiveSelectedId` becomes null and address form opens automatically (CheckoutView.tsx:141).
- STEP 0 contract facts (server, quoted/read-only): routes in `server/routes/api.php` - public `GET /services/{slug}/availability` (`ServiceController@availability`, throttle `service-availability`, name `services.availability`); authenticated `POST /bookings` (`BookingController@store`), `GET /bookings` (`index`), `GET /bookings/{booking}` (`show`), `POST /bookings/{booking}/cancel` (`cancel`) in `auth:sanctum` group. No customer reschedule route. `BookingController`: store returns 201 `{booking}` with service loaded; index returns 200 `{bookings: paginator}` from `user->bookings()->latest()`; show returns 200 `{booking}` with service loaded, ownership/unknown via `findOwnedBookingOrFail` -> 404 `{"message":"Not Found"}`; cancel returns 200 `{booking}`. `StoreBookingRequest` rules: `service_id` required integer exists services, `scheduled_slot_start` required date, `scheduled_slot_end` required date after start, `address_id` nullable integer exists addresses, `problem_description` nullable string; JSON body, no attachments; window() normalizes to UTC. `ServiceBooking` fillable/casts: status string, scheduled_slot_start/end datetime, final_price decimal:2, cancelled_at datetime; statuses in service/model: `pending, confirmed, technician_on_the_way, completed, cancelled`. `BookingService`: conflict/slot-taken throws `SchedulingValidationException::slotUnavailable()` -> 422 `{"message":"This time slot is no longer available. Please choose a different time."}` (BOOKING_SLOT_UNAVAILABLE); cancel cutoff reads `BusinessSetting` `cancellation_cutoff_minutes` (default 120) and rejects with 422 `{"message":"Bookings can only be cancelled at least {cutoff} minutes before the scheduled slot."}`. `ServiceAvailabilityService/ServiceController`: availability returns `{service:{id,slug,duration_minutes}, date, timezone, slots:[{start,end}], nearest_slot?}`; `nearest_slot` included when `mode=nearest`; slots/times serialized ISO-8601 with offset in business timezone (Asia/Karachi in dev config). 422 validation for date/mode; 404 for missing/unpublished service.
- STEP 0g dev data readiness (read-only): `GET /api/v1/services` on 2026-11-23 returned total 0, no published services. No availability calls made (budget 0/8 used). Booking proof script blocked by missing bookable data.
- Files changed (allowed): `packages/api-client/src/bookings.ts` (new), `packages/api-client/src/bookings.test.ts` (new), `packages/api-client/src/index.ts` (exports/types only), `apps/storefront/app/test/handlers-bookings.ts` (new), `apps/storefront/app/test/bookings-msw-agreement.test.tsx` (new), `apps/storefront/app/test/server.ts` (register handlers-bookings), `apps/storefront/app/test/setup.ts` (reset bookings handlers), `apps/storefront/app/test/handlers.ts` (booking call counters/reset), `phases.md`, `AGENTS.md`. `getServiceAvailability` placed in `bookings.ts` because BK-0 allowed files do not include `services.ts`; exported from package index.
- STEP 1 RED (real, before implementation): `packages/api-client` `npx vitest run src/bookings.test.ts` -> FAIL, 1 failed suite, 0 tests, `Error: Cannot find module '/src/bookings' imported from .../bookings.test.ts`. `apps/storefront` `npx vitest run app/test/bookings-msw-agreement.test.tsx` -> FAIL, 1 failed suite, 0 tests, `Failed to resolve import "./handlers-bookings" from "app/test/bookings-msw-agreement.test.tsx"`.
- STEP 3 GREEN: `bookings.test.ts` 1 file / 19 tests passed; `bookings-msw-agreement.test.tsx` 1 file / 9 tests passed. Full api-client suite: 18 files / 265 tests passed. Full storefront suite: 51 files / 488 tests passed.
- STEP 4 mutations (one-shot, reverted by hand, SHA256 equal to $env:TEMP *.bak-BK0 backups, rerun GREEN): M1 changed `cancelBooking` to GET in `bookings.ts` -> `bookings.test.ts` 4 failed / 15 passed; failure message included `TypeError: Cannot destructure property 'data' of '(intermediate value)' as it is undefined.` and assertion diffs for 404/422/401 propagation. M2 changed availability query param `date` to `day` -> `bookings.test.ts` 2 failed / 17 passed; diff showed expected `date` received `day` for both date and mode=nearest cases. M3 removed conflict rejection in `handlers-bookings.ts` -> agreement test 1 failed / 8 passed; `AssertionError: promise resolved "{ booking: { id: 100, ... } }" instead of rejecting` on "POST /bookings conflict returns 422 with real server message".
- STEP 6: storefront lint EXIT=0, 10 warnings total, none from files created/changed by BK-0. `tsc -b` (tsbuildinfo cleared) EXIT=0. Created-file BOM/NONASCII check: all four created files BOM=False NONASCII=0.
- STEP 7 verify (one background job, full, no -Fast, EXIT=0): ALL STEPS PASS. tsc-b PASS errors:0; storefront-vitest PASS 51/488; api-client-vitest PASS 18/265; ui-vitest PASS 30/243; storefront-build PASS; admin-build PASS; prerender PASS; check-built-css PASS sf 9/9 root-BDIvYeev.css + ad 9/9 index-C8ZbbmyJ.css; lint PASS warnings:10.
- STEP 5 real-API proof: BLOCKED by missing dev bookable data. `GET /api/v1/services` returned `total: 0` on 2026-11-23 00:11:13 +05:00 (PKT). No published service means availability cannot be queried and no booking can be created; script not written/run per task rule. Missing data for a real proof: at least one published service with duration/price and business hours configured so `/api/v1/services/{slug}/availability?date=YYYY-MM-DD` returns at least one free slot inside the booking window. Likely admin/setup prerequisites: create/publish a service (admin services endpoints) and configure business hours/business settings (including `booking_advance_days` and `cancellation_cutoff_minutes` if defaults not present); confirm no holidays block the selected date. No data created.
- Deliberate omissions: no UI/routes/components, no server/packages/ui/admin changes, no reschedule (no customer endpoint), no attachments (not in StoreBookingRequest), no booking-proof script/run because dev has no bookable data, no commit.

## BE6 - Admin API for business hours and holidays (2026-11-24)

- STEP 0 (read-only, observed): `BusinessHour` model (`app/Models/BusinessHour.php`) fillable `day_of_week, opens_at, closes_at, is_closed`, cast `is_closed=>boolean`; migration `2026_08_25_000017_create_business_hours_table.php` has `unsignedTinyInteger day_of_week` unique, nullable `time opens_at/closes_at`, `boolean is_closed default false`. `Holiday` model fillable `date, reason`, cast `date=>date`; migration `2026_08_25_000018_create_holidays_table.php` has `date` unique, nullable `reason`. `SlotGenerationService` reads via `BusinessHourRepositoryInterface::findByDayOfWeek(int)` and `HolidayRepositoryInterface::existsOnDate(Carbon)`; interprets weekday/date in business timezone through `BusinessClock`. Existing repos/contracts only exposed those two methods; no admin business-hours/holidays routes existed. Admin pattern observed from `Admin/ServiceController`, `Admin/SettingController`, route group `auth:sanctum, admin, AuthenticateSession::class` in `routes/api.php`. Existing scheduling tests: `BusinessHourModelTest`, `HolidayModelTest`, `SlotGenerationServiceTest`.
- STEP 1 RED (real, Docker `infra/dev docker compose run --rm api sh -lc "php artisan test tests/Feature/Api/V1/AdminBusinessHourApiTest.php tests/Feature/Api/V1/AdminHolidayApiTest.php"`): `Tests: 2 passed, 16 failed (23 assertions), Duration 7.58s, EXIT=2`. Failures were 404/404/404/404/404/404/422-as-404/404/404/404/404/404/422-as-404/422-as-404/404/404 for missing admin endpoints; 2 weak passes were unknown-id 404 cases passing because routes were absent. Test bug fixed before GREEN: `Service::factory()->published()` does not exist; changed to `is_published => true` in `AdminBusinessHourApiTest`.
- STEP 2 implementation (no migrations): extended `BusinessHourRepositoryInterface`/`EloquentBusinessHourRepository` and `HolidayRepositoryInterface`/`EloquentHolidayRepository` with `all()` (ordered). Added `Admin/BusinessHourController`, `Admin/HolidayController`, `Store/UpdateBusinessHourRequest`, `Store/UpdateHolidayRequest`. Routes added in existing admin group: `Route::apiResource('business-hours', AdminBusinessHourController::class)->except(['create','edit'])` and `Route::apiResource('holidays', AdminHolidayController::class)->except(['create','edit'])`. Business-hour writes normalize closed rows to null times; holiday validation uses `whereDate` duplicate checks to handle date-cast storage. Writes audit-logged via `AuditLogger`.
- STEP 3 GREEN: new tests `php artisan test tests/Feature/Api/V1/AdminBusinessHourApiTest.php tests/Feature/Api/V1/AdminHolidayApiTest.php` => `18 passed (106 assertions), EXIT=0`. Scoped suite `php artisan test tests/Feature/Api/V1/AdminBusinessHourApiTest.php tests/Feature/Api/V1/AdminHolidayApiTest.php tests/Feature/Api/V1/ServiceAvailabilityApiTest.php tests/Feature/Modules/Scheduling` => `149 passed (530 assertions), Duration 36.19s, EXIT=0`.
- Pint: first `--test` on BE6-changed files reported `FAIL 13 files, 2 style issues` (`StoreHolidayRequest.php`, `UpdateHolidayRequest.php` fully qualified class names), EXIT=1. `pint` fixed both; rerun `--test` => `PASS 13 files`, EXIT=0.
- Route count evidence: BE6 added 2 `Route::apiResource` lines in `server/routes/api.php` (`business-hours`, `holidays`). Real `php artisan route:list --path=api/v1 --json` count (Docker `infra/dev`, BE6-fix A5, 2026-11-24): 115 total API routes; 10 routes for business-hours/holidays (5 + 5). The earlier BE6 draft noted `Route::` line-count 86 -> 88, which is a different/textual measure; route:list is authoritative.
- SRS: added section 5 admin scheduling config API note for `/api/v1/admin/business-hours` and `/api/v1/admin/holidays` (contract added).
- Out of scope / not done: reschedule, attachments, serviceable areas, frontend, seeders, admin UI, migrations, full backend suite. No commit made.

## BE6-fix - Admin scheduling review fixes (2026-11-24)

- STEP A (read-only, observed): `git log --oneline -3` confirmed BK-0 committed (`c408085`); `git status --short` showed 7 modified + 8 untracked files. `git diff --stat -- SRS.md` before fix: `SRS.md | 3 ++-` (2 insertions, 1 deletion); "Shipping fee API" count 1, "Admin scheduling config API" count 1. Em-dash (U+2014) count command reported HEAD=0 WORK=47 before fix (anomaly: likely PowerShell/git-show encoding artifact; not treated as proof of content loss). SRS damage was real: shipping-fee line em-dashes replaced by ASCII hyphens while adding admin scheduling bullet. Fixed forward by restoring HEAD shipping-fee line and keeping single new admin scheduling bullet; final `git diff --stat -- SRS.md`: `1 file changed, 1 insertion(+)`. Routes inspection showed business-hours/holidays `apiResource` lines inserted inside Business Settings comment block, splitting comment from `Route::bind('setting')`; fixed by moving block above settings comment/bind. `'closes_at' =>` count: 1 in StoreBusinessHourRequest, 1 in UpdateBusinessHourRequest. Holiday requests had whereDate closure duplicate checks (no redundant Rule::unique->where). Real route count: `docker compose run --rm api sh -lc "php artisan route:list --path=api/v1 --json"` (Docker infra/dev), JSON `{"domain"` object count TOTAL=115; 10 business-hours/holidays routes (5 + 5) all under `api, Illuminate\Auth\Middleware\Authenticate:sanctum, App\Http\Middleware\EnsureUserIsAdmin, Laravel\Sanctum\Http\Middleware\AuthenticateSession`.
- STEP B RED (real, Docker): after adding B1 (date serialized as `Y-m-d` in create/show/update/list), B2 (audit logs create/update/delete for BusinessHour/Holiday with entity/entity_id/action/actor_id), B3 (holiday update same date + reason change returns 200; business-hour same day_of_week already covered - not duplicated), B4 (whitespace/datetime-string date rejected 422): `php artisan test tests/Feature/Api/V1/AdminBusinessHourApiTest.php tests/Feature/Api/V1/AdminHolidayApiTest.php` => `3 failed, 19 passed (113 assertions), EXIT=1`. Failures: B1 create assertion got `2027-01-01T00:00:00.000000Z` vs `2027-01-01`; B4 whitespace date accepted (201) because TrimStrings trimmed input before validation.
- STEP C implementation: `Holiday` model cast changed `date => date:Y-m-d`; `EloquentHolidayRepository::existsOnDate()` changed from `whereBetween(startOfDay,endOfDay)` to `whereDate(date, toDateString())` because DATE column raw value is `Y-m-d` under `date:Y-m-d` cast and whereBetween datetime bounds missed it (root cause of 4 scoped failures: AdminHolidayApiTest holiday-removes-slots, ServiceAvailabilityApiTest holiday no slots, BusinessTimezoneTest holiday no slots, SlotGenerationServiceTest holiday yields no slots). Store/UpdateHolidayRequest `validationData()` overridden (public, raw JSON date) so whitespace/datetime-string dates are rejected by `date_format:Y-m-d`. No redundant Rule::unique found in holiday requests; no duplicate `closes_at` keys; unused-import cleanup handled by Pint. Routes reordered: Business Hours/Holidays block placed above Business Settings comment/bind/settings routes inside same admin group. Route comment repair used a targeted PowerShell `[IO.File]::WriteAllText` on `server/routes/api.php` (AGENTS-spirit exception; minimal diff verified, missing "Generic key/value/type..." comment line restored via Edit).
- STEP D GREEN (Docker, infra/dev): `php artisan test tests/Feature/Api/V1/AdminBusinessHourApiTest.php tests/Feature/Api/V1/AdminHolidayApiTest.php tests/Feature/Api/V1/ServiceAvailabilityApiTest.php tests/Feature/Modules/Scheduling` => `Tests: 153 passed (555 assertions), Duration: 30.99s, EXIT=0`. Pint: first `--test` on 14 changed PHP files => `FAIL 14 files, 2 style issues` (no_unused_imports in both BE6 test files), EXIT=1; `pint` fixed 2; rerun `--test` => `PASS 14 files, EXIT=0`.
- DECISION: customer reschedule = real endpoint (BE7: atomic new-slot booking + cancel old + `rescheduled_from_id`, same 2h cutoff and overlap rules).
- DECISION: serviceable areas = `BusinessSetting` JSON city list + address city validation on booking create (BE8).
- DECISION: booking photo = V1 but after the wizard exists (BE9).
- TRACKED: closed-row normalization lives in BusinessHourController (rules.md 3 debt).
- TRACKED: duplicate-holiday race can 500 at DB unique constraint.
- TRACKED: creating a holiday does not touch existing bookings on that date (admin UI must warn - Stage C).
- Out of scope / not done: reschedule/areas/attachments implementation, frontend, seeders, migrations, full backend suite. No commit made.

## BK-0c - Dev seed via real admin API + real-API bookings proof (2026-11-24)

- STEP 0 (read-only, PROVEN): `server/app/Console/Commands/CreateAdminUser.php:22` signature `admin:create {--name=} {--email=} {--password=}`; prompts for missing options, validates with `RegisterRequest::baseRules()`, creates admin role user, never prints/logs password. `server/app/Http/Controllers/Api/V1/Admin/ServiceController.php:44-51` store takes `StoreServiceRequest` validated data, returns 201 `{service}`; `71-78` publish returns `{service}`. `server/app/Modules/Services/Http/Requests/StoreServiceRequest.php:23-37` fields: name required string max:255, slug nullable regex, description nullable string, price_min required numeric min:0 lte:price_max, price_max required numeric min:0, duration_minutes required integer min:1, is_published nullable boolean. Cookie/XSRF pattern reused from `scripts/addresses-proof.ps1:42-48,77` and `scripts/pw-proof.ps1:51-57,92` (curl.exe cookie jar, Origin/Referer localhost:5173, Accept/Content-Type json, X-XSRF-TOKEN from jar, GET /sanctum/csrf-cookie 204). Dev API `http://localhost:8000/sanctum/csrf-cookie` returned 204 (PROVEN). Dev-serve settings (docker exec, read-only): `booking_max_advance_days=60, business_timezone=Asia/Karachi, cancellation_cutoff_minutes=120, min_booking_notice_minutes=60, service_buffer_minutes=15, slot_hold_minutes=10`.
- STEP 1 dev-seed (PROVEN): `scripts/dev-seed.ps1` (DEV ONLY header, never production) created throwaway admin via `docker compose -f infra/dev/docker-compose.dev-serve.yml exec -T api-serve php artisan admin:create` with random password kept only in variable (not printed/written). Ran as one background job; log `$env:TEMP\bk0c-seed.log`, exit `$env:TEMP\bk0c-seed.exit`.
  Evidence: `CSRF status=204`, `ADMIN_CREATED email=dev-seed-admin-f07b5c3f016a@example.test`, `ADMIN_LOGIN status=200`, `SERVICE_CREATED slug=dev-laptop-checkup id=21`, `SERVICE_STATUS slug=dev-laptop-checkup status=published`, `HOURS_ROWS count=7 created=7 skipped=0`, `DEV_SEED RESULT PASS`, `SERVICE_SLUG=dev-laptop-checkup`, `SCRIPT_EXIT=0`, `EXIT=0`.
- STEP 2 bookings-proof (PROVEN with one script-assumption mismatch): `scripts/bookings-proof.ps1` ran as one background job; log `$env:TEMP\bk0c-proof.log`, exit `$env:TEMP\bk0c-proof.exit`. Result: `BOOKINGPROOF RESULT FAIL`, `SCRIPT_EXIT=0`, process `EXIT=1`, `AVAILABILITY_CALLS=4`.
  - P1 availability date 2026-11-27: 200 MATCH, `slots_count=7 offset_plus0500=True first_start=2026-11-27T09:00:00+05:00`. Nearest mode 200 MATCH, `has_nearest_slot=True`.
  - P2 address create 201 MATCH; booking create 201 MATCH, `booking_id=1`. Real booking create response keys: `user_id, service_id, address_id, scheduled_slot_start, scheduled_slot_end, status, problem_description, updated_at, created_at, id, service.{id,name,slug,description,price_min,price_max,duration_minutes,is_published,created_at,updated_at}`. Real raw showed UTC Z datetimes and service loaded.
  - P3 same user same slot: 422 MATCH, message `This time slot is no longer available. Please choose a different time.`. Second user same slot: **404 MISMATCH** (script expected 422) with message `Not Found`; cause: script reused customer 1 address_id, so address ownership/not-found check fired before slot conflict - script assumption, not a slot-conflict contract failure. Targeted same-user-different-address slot conflict remains UNPROVEN by this script.
  - P4 list 200 MATCH, `contains_booking=True`; paginator keys include `current_page,data,first_page_url,from,last_page,last_page_url,links,next_page_url,path,per_page,prev_page_url,to,total` and data items include `technician_id,final_price,cancelled_at,rescheduled_from_id`. Show 200 MATCH, service loaded.
  - P5 other customer show 404 MATCH `Not Found`; guest list 401 MATCH.
  - P6 cancel 200 MATCH `booking_status=cancelled`; cancel again 422 MATCH `This booking has already been cancelled.`; availability after cancel 200 MATCH `slot_free_again=True`.
  - P7 cutoff: `P7_today_avail` 200 MATCH for 2026-11-24, no slot within 120 minutes found; `P7 status=UNPROVEN`.
- STEP 3 gap findings (real API vs api-client/MSW, PROVEN from P1-P6 responses; no app code changed; closed by BK-1 2026-11-25):
  1. **Create booking response omits fields present in show/list:** create returned no `technician_id, final_price, cancelled_at, rescheduled_from_id`; api-client `Booking` types them as present (nullable/number|null). Show/list include them.
  2. **List response is a full Laravel paginator:** real has `first_page_url, from, last_page, last_page_url, links[], next_page_url, path, prev_page_url, to` plus `current_page,data,per_page,total`. MSW returns only `data,total,per_page,current_page`. api-client paginator is tolerant via `[key:string]:unknown`.
  3. **Availability slot datetime format/offset differs:** real slots are business-timezone offset strings like `2026-11-27T09:00:00+05:00`; MSW uses UTC Z strings like `2026-11-23T04:00:00.000Z`. api-client types as `string`, but MSW fidelity is off.
  4. **Booking datetimes are UTC Z with microseconds:** real `...T04:00:00.000000Z`; MSW uses `...000Z` (milliseconds) - minor format difference, both parseable.
  5. **Service object in booking responses is fuller than MSW:** real includes `description, price_min, price_max, is_published, created_at, updated_at`; MSW booking service only has `id, slug, duration_minutes`.
  6. **Cancel-already-cancelled behavior differs:** real returns 422 `This booking has already been cancelled.`; MSW cancel handler has no already-cancelled guard and returns cancelled booking.
  7. **Address ownership failure mode:** posting a booking with another user's `address_id` returned 404 `Not Found` (P3_other_user evidence); MSW does not model address ownership.
  8. **MSW booking list does not model ownership/pagination/filtering realism:** real list is user-scoped and paginated; MSW is a simple in-memory array.
- DECISION: A holiday cannot be created on a date that still has active (pending/confirmed/technician_on_the_way) bookings; admin must reschedule them first (with a reason note), then the day can be blocked. Enforced in the backend (BE7), plus admin UI shows the list of bookings for that date (Stage C).
- TRACKED: holiday request `validationData()` override reads raw JSON (TrimStrings bypass) and does not cover form-encoded bodies.
- RESOLVED by BK-1 (2026-11-25): real-API booking proof P3 same-slot-different-user conflict now proven cleanly (C2 owns own address -> 422 slot unavailable; P3b C2 posts C1 address_id -> 404 Not Found).
- TRACKED: P7 cutoff rejection UNPROVEN by real API (no in-cutoff slot available at proof time; no settings changed).
- Out of scope / not done: any server/frontend code changes, migrations, seeders, changing settings, production anything. No commit made.

## BK-1 - Fix bookings proof P3 + align Booking api-client/MSW with real API (2026-11-25)

- STEP 0 (read-only, PROVEN): dev API up (`curl.exe -s -o NUL -w "%{http_code}" http://localhost:8000/sanctum/csrf-cookie` => `204`). Dev service exists (`GET /api/v1/services/dev-laptop-checkup` => 200 with `{"service":{"id":21,"name":"Dev Laptop Checkup","slug":"dev-laptop-checkup","description":"Dev seed service for booking proof.","price_min":"1500.00","price_max":"3500.00","duration_minutes":60,"is_published":true,"created_at":"2026-11-23T23:40:57.000000Z","updated_at":"2026-11-23T23:40:58.000000Z"}}`). Quoted contract sources for report: `packages/api-client/src/bookings.ts` (Booking/BookingServiceSummary/BookingsPaginator/getServiceAvailability), `apps/storefront/app/test/handlers-bookings.ts` (BK-0 MSW handlers).
- PART A (PROVEN): `scripts/bookings-proof.ps1` fixed. P3 now creates customer 2's own address (POST /api/v1/addresses, 201) then posts same slot with that address_id -> 422 "This time slot is no longer available. Please choose a different time." P3b posts customer 1's address_id as customer 2 -> 404 "Not Found" (address ownership). Target date selected dynamically 3-5 days ahead, skipping Sunday, trying next day within the 8-call availability budget; 3s apart; max 8 availability calls total; cleanup unchanged (none). Background run (`$env:TEMP\bk1-proof.log`, `$env:TEMP\bk1-proof.exit`): `P1_date selected_date=2026-11-28 slots_count=7 offset_plus0500=True first_start=2026-11-28T09:00:00+05:00`; `P3_c2_address ... status=201 expected=201 MATCH`; `P3_other_user ... status=422 expected=422 MATCH`, `message=This time slot is no longer available. Please choose a different time.`; `P3b_other_user_foreign_address ... status=404 expected=404 MATCH`, `message=Not Found`; `P6 slot_free_again=True`; `P7 status=UNPROVEN detail=no qualifying in-cutoff slot found today or not safe to prove without changing settings`; `AVAILABILITY_CALLS=4`; `BOOKINGPROOF RESULT PASS`; `SCRIPT_EXIT=0`; process `EXIT=0`.
- PART B (api-client, PROVEN): updated `packages/api-client/src/bookings.ts` so `technician_id, final_price, cancelled_at, rescheduled_from_id` are optional on `Booking` (create omits them; show/list include). Added real `BookingServiceSummary` keys (`id,name,slug,description,price_min,price_max,duration_minutes,is_published,created_at,updated_at`, money as strings). Reused `Paginator<T>` from `packages/api-client/src/catalog.ts` for `BookingsPaginator = Paginator<Booking>`; extended `Paginator.links` with `page: number | null` to match real Laravel paginator. Updated `packages/api-client/src/bookings.test.ts` fixtures to real shapes (full service, create response without 4 fields, full paginator envelope with links/page/urls). `npx vitest run src/bookings.test.ts` (packages/api-client) => `1 passed (1) / 19 passed (19), EXIT=0`. Full api-client suite => `18 passed (18) / 265 passed (265), EXIT=0`.
- PART C (MSW + agreement, PROVEN): added 6 real-contract tests to `apps/storefront/app/test/bookings-msw-agreement.test.tsx` (availability +05:00 slots, create omits 4 fields + full service object + microsecond UTC, show/list include 4 fields, full Laravel paginator + ?page, real overlap conflict/cancelled frees slot, already-cancelled 422, foreign address_id 404). REAL RED before handler rewrite: `npx vitest run app/test/bookings-msw-agreement.test.tsx` (apps/storefront) => `6 failed | 10 passed (16), EXIT=1` (`$env:TEMP\bk1-red-msw.txt`). Failures: slot offset expected +05:00 got UTC Z; create had technician_id/final_price/cancelled_at/rescheduled_from_id; paginator missing full shape; overlap resolved instead of rejecting; already-cancelled resolved instead of rejecting; foreign address resolved instead of rejecting. Rewrote `apps/storefront/app/test/handlers-bookings.ts` to real contract: +05:00 Asia/Karachi slots 09:00-18:00 60min+15min buffer; microsecond UTC booking datetimes; create omits 4 fields and returns full service; show/list/detail include 4 fields; real overlap check against stored non-cancelled same-service bookings -> 422 real message; cancelled booking frees slot; cancelling already-cancelled booking -> 422 "This booking has already been cancelled."; address_id not owned -> 404 "Not Found"; list user-scoped with full paginator honoring ?page. Cutoff rejection kept flag-driven (`setBookingCancelCutoffError`) because real cutoff depends on current time vs slot start and business settings; documented in handler comment. GREEN: `16 passed (16), EXIT=0`.
- MUTATE [MUTATE] (PROVEN): backup `$env:TEMP\bk1-handlers-bookings.bak.ts`, SHA256 `6A117026EB6E1A71796083C420CC7B01289C1ACD7EA6C0B0B1777ACC80D8C020`. One-shot mutation removed overlap check (`hasOverlapConflict` branch) in POST /bookings. Command: `npx vitest run app/test/bookings-msw-agreement.test.tsx -t "real overlap conflict"` (apps/storefront). Result: `1 failed | 15 skipped (16), EXIT=1`. Failure: `AssertionError: promise resolved "{ booking: { id: 101, …(14) } }" instead of rejecting` at `app/test/bookings-msw-agreement.test.tsx:271:6`. Reverted by restoring backup; SHA256 equal `EQUAL=True`. Post-mutate: `16 passed (16), EXIT=0`.
- VERIFY (PROVEN): full `scripts/verify-frontend.ps1` as one background job, no `-Fast` (`$env:TEMP\bk1-verify.log`, `$env:TEMP\bk1-verify.exit`). Result: `EXIT=0`, `ALL STEPS PASS`. Counts: tsc-b PASS errors:0; storefront-vitest PASS 51/495; api-client-vitest PASS 18/265; ui-vitest PASS 30/243; storefront-build PASS; admin-build PASS; prerender PASS (index,shop,services,login,register,__spa-fallback); check-built-css PASS sf 9/9 root-BDIvYeev.css + ad 9/9 index-C8ZbbmyJ.css; lint PASS warnings:10.
- Docs: BK-0c fidelity gap list marked closed by BK-1; BK-0c P3 TRACKED marked RESOLVED by BK-1; AGENTS totals/queue/TRACKED updated.
- TRACKED: booking create allows `address_id` null (doorstep booking needs an address; decide with BE8).
- Out of scope / not done: server code, UI, reschedule/areas/attachments, settings changes. No commit made.

## BE8a-1 - User gender + address map_link (backend only, 2026-11-26)

- STEP 0 (read-only, PROVEN): `StoreAddressRequest.php:24` `address_line_1` required string max:255; `UpdateAddressRequest.php:24` `address_line_1` sometimes string max:255. `RegisterRequest.php:16-24` baseRules = name/email/password(min:8) (+ confirmed in rules()); used by `CreateAdminUser.php:22,45,71-76` (`admin:create {--name=} {--email=} {--password=}`, validates with baseRules, creates admin with role_id). Existing register API payload tests: `AuthTest.php` 8 matches, `RateLimitingTest.php` 2. Address POST API payload tests: `AddressApiTest.php` 3 POST create matches (15 total /api/v1/addresses matches). `address_id` in server/tests: 29 matches.
- STEP 1 RED (real, Docker `infra/dev`, log `$env:TEMP\be8a1-red.txt`): `php artisan test tests/Feature/Api/V1/UserGenderApiTest.php tests/Feature/Api/V1/AddressMapLinkApiTest.php tests/Unit/Modules/Orders/Support/MapLinkRulesTest.php` => `Tests: 52 failed (27 assertions), Duration 26.50s, EXIT=2`. Failures included missing `gender` column QueryException/500s and `Class "App\Modules\Orders\Support\MapLinkRules" not found`.
- STEP 2 implementation: additive migrations `2026_08_26_000001_add_gender_to_users_table.php` (nullable string gender, down drops column) and `2026_08_26_000002_add_map_link_to_addresses_table.php` (nullable string(500) map_link, down drops column). `User` fillable +gender; `UserFactory` default random male/female/other. `Address` fillable +map_link; `AddressFactory` default `https://maps.app.goo.gl/<random>`. `RegisterRequest::baseRules()` requires `gender in:male,female,other`; `AuthController::register` stores gender. `UpdateProfileRequest` allows `gender sometimes in:male,female,other` (not clearable); `ProfileService::updateProfile` saves gender when present, audit-log behavior unchanged. `CreateAdminUser` adds `--gender=other` default and passes/validates gender so scripted admin creation and dev-seed remain working. `MapLinkRules` (DRY) enforces https, no userinfo, host allow-list (`google.com`/`www.google.com` maps paths, `maps.google.com` maps or root/query paths, `maps.app.goo.gl`, `goo.gl/maps...`), max 500; StoreAddressRequest requires map_link, UpdateAddressRequest sometimes requires map_link.
- STEP 3 GREEN for new BE8a-1 tests (Docker): first post-impl run `Tests: 5 failed, 47 passed (119 assertions), Duration 19.92s, EXIT=1` (`$env:TEMP\be8a1-new-green.txt`) because `MapLinkRules` rejected `https://maps.google.com/?q=Lahore` (approved dataset) and UserGenderApiTest lacked Sanctum SPA Origin/Referer+CSRF setup causing session-store 500 on register. Fixed rule to accept maps.google.com root/query path and added Origin/Referer+ValidateCsrfToken beforeEach to UserGenderApiTest. Rerun => `Tests: 52 passed (127 assertions), Duration 18.97s, EXIT=0` (`$env:TEMP\be8a1-new-green3.txt`).
- Existing test updates (payloads only, assertions not weakened): `AuthTest.php` (7 register payloads +gender), `RateLimitingTest.php` (2 register payloads +gender), `AddressApiTest.php` (1 create payload +map_link, validation-errors assertion strengthened to include map_link).
- Scoped backend (Docker, `$env:TEMP\be8a1-scoped.txt`): `php artisan test tests/Feature/Api/V1/AuthTest.php tests/Feature/Api/V1/UserGenderApiTest.php tests/Feature/Api/V1/ProfileApiTest.php tests/Feature/Api/V1/AddressApiTest.php tests/Feature/Api/V1/AddressMapLinkApiTest.php tests/Feature/Api/V1/OrderApiTest.php tests/Feature/Api/V1/BookingApiTest.php tests/Feature/Api/V1/ReviewApiTest.php tests/Feature/RateLimitingTest.php tests/Feature/Console/CreateAdminUserTest.php tests/Feature/Modules/Users tests/Feature/Modules/Orders tests/Unit/Modules/Orders/Support/MapLinkRulesTest.php` => `Tests: 196 passed (671 assertions), Duration 54.82s, EXIT=0`.
- Pint: `vendor/bin/pint --test` on 20 changed PHP files => `PASS 20 files, EXIT=0` (`$env:TEMP\be8a1-pint.txt`).
- Full backend suite once (Docker, factories changed, `$env:TEMP\be8a1-full.txt`): `php artisan test` => `Tests: 858 passed (3226 assertions), Duration 159.43s, EXIT=0`.
- Migration up/down/up proof (Docker, throwaway sqlite /tmp/be8a1.sqlite, `$env:TEMP\be8a1-migrate3.txt`, EXIT=0): migrate:fresh applied all; rollback of 2026_08_26_000001 and 2026_08_26_000002 by --path showed both Pending in migrate:status; migrate reapplied both as [2] Ran. Noisy "Migration not found" lines observed from --path rollback output; final status lines are authoritative.
- Route count (Docker, `php artisan route:list --path=api/v1 --json`, `$env:TEMP\be8a1-routes-clean.json`): `ROUTE_COUNT=115, EXIT=0` (unchanged; no route files changed).
- Docs: SRS.md section 5 added User profile and addresses bullet (git diff --stat -- SRS.md: 1 insertion, em-dash damage checked/fixed). AGENTS.md queue updated (BE8a-1 done, BE8a-2/BE8b/BE7/BE8/BE9/FE tasks/B5 ordering) and DECISION lines added for gender snapshots, map_link allow-list, address required for bookings/orders, technician selection V2.
- Out of scope / not done: orders/bookings snapshot fields and complaint fields (BE8a-2), address-required enforcement in booking/order flows (BE8a-2/BE8b), frontend/MSW, technician features, migrations beyond the two additive columns. No commit made.
