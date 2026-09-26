# phases.md — Development Roadmap
**Location in repo:** `/docs/phases.md`
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
**Completion criteria:** availability API correctly reflects all configured constraints and cannot be raced into a double booking.

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
9. **shipping_fee stored as string not decimal** — orders store shipping_fee as a string rather than a locale-safe decimal; normalize the column/casting and re-audit all comparisons for correctness.
10. **Public listing endpoints have no per_page cap** — list endpoints accept unbounded per_page without an upper bound; introduce a documented cap.
11. **SlotGenerationService::nearestAvailableSlot() N+1** — the nearest-slot suggestion issues queries per candidate day; collapse to a bounded query set.
12. **HomepageBanner/ReviewShowcase reorder() partial-ID-list stale display_order** — reordering with a partial ID list leaves unlisted rows at stale display_order values; reconcile ordering for partial lists.
13. **Production MySQL transaction_isolation should be confirmed REPEATABLE READ** — the booking-slot concurrency guarantees assume REPEATABLE READ; verify Hostinger MySQL's default before go-live.
14. **No cross-device session invalidation after password change** — a password change does not invalidate sessions/tokens on other devices; add invalidation for Phase 12.
15. **AdminAssetController uses inline `$request->validate()` instead of a dedicated FormRequest** — unlike every other admin controller in this codebase, a deliberate scope-limited deviation from the Task upload-endpoint; align it with the FormRequest pattern for consistency.

---

## Phase 13 — Deployment
**Objective:** go-live.
**Dependencies:** Phase 12.
**Completion criteria:** production environment configured (env vars, HTTPS, CORS, logging, error monitoring, DB backups considered), smoke-tested in production.

---

## Quality Gate (applies to every phase above)
A phase is not marked complete unless:
- Requirement implemented as specified in `PRD.md`.
- Architecture from `architecture.md` followed (no ad hoc shortcuts).
- Rules from `rules.md` followed (no hard-coded values, proper auth enforcement, tests present).
- No regression introduced in a previously completed phase (explicitly re-verify, don't assume).
- Responsive and accessibility behavior checked for any new screen/component.

---

## Frontend Testing Debt (tracked, not blocking)
TRACKED (not urgent): packages/api-client's catalog.ts, cart.ts, order.ts, and address.ts modules have no unit test coverage (pre-existing gap, predates the services.ts module which does have tests as of 2026-09-26). Should be closed during a future hardening pass, mirroring the discipline already applied to services.ts and to every packages/ui component.
