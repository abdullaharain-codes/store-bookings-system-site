# rules.md — Development Rules (Source of Truth)
**Location in repo:** `/docs/rules.md`
**Applies to:** every human or AI contributor modifying this codebase.

---

## 1. Coding Standards & Naming
- Consistent casing per language convention (e.g., `camelCase` for variables/functions, `PascalCase` for classes/components, `kebab-case` for file/route names, `UPPER_SNAKE_CASE` for constants). Do not mix conventions within a module.
- Names must describe *what*, not *how* (`getPublishedCategories()`, not `getCatsV2()`).
- No abbreviations that aren't domain-standard (`qty` acceptable, `svc` for "service" is not — this project has an actual `Service` domain entity, ambiguity is unacceptable here specifically).

## 2. Folder Structure Rules
- Follow the structure in `architecture.md` §13. New modules go under `/server/src/modules/{module-name}`, never loose files at the root.
- Shared/reusable UI components live only in `/packages/ui` — never duplicated inside `/apps/storefront` or `/apps/admin`.
- One module = one domain concept. Do not add "misc" or "utils" catch-all modules for business logic (generic technical utilities are fine; business rules are not).

## 3. OOP / SOLID / DRY / Reusability Rules
- **Single Responsibility:** a service class handles one domain concept (e.g., `SchedulingService` computes availability; it does not also send notifications — call `NotificationService` instead).
- **Open/Closed:** new business rules (e.g., a new cancellation policy tier) should be addable via new configuration/strategy, not by editing existing conditional chains into unreadable branches.
- **Dependency Inversion:** services depend on repository interfaces, not concrete DB clients, so data-layer swaps or unit-test mocking don't ripple through business logic.
- **DRY:** if the same validation, formatting, or business-rule logic is needed in two places (e.g., "is this slot still bookable" logic used by both booking-create and reschedule), extract it once into the `SchedulingService` — never copy-paste.
- Business logic never lives in controllers/routes or in frontend components — it lives in the service layer, callable and unit-testable in isolation.

## 4. Component Rules (frontend)
- Every reusable UI element (Button, Input, Card, Carousel, Modal, Badge, Stepper, Table, Empty/Loading/Error state) is built once in `/packages/ui` and imported everywhere — no page builds its own one-off button or card.
- The **Carousel** component must be generic enough to power both the Review Showcase and the Homepage Hero Banner sliders (auto-scroll, hover-pause, swipe, loop, prev/next controls, lightbox-on-click as an optional prop) — build one configurable component, not two near-duplicate carousels.
- Components receive data via props/typed API responses — never import static category/brand/banner lists (per `architecture.md` §6 "no hard-coding" rule).
- No component should silently swallow a loading or error state — every data-driven component implements loading, empty, and error rendering paths (ties to Section 12).

## 5. API Rules
- REST, versioned (`/api/v1`), resource-named routes (`architecture.md` §7).
- Every request body validated against a schema before reaching service logic; invalid input never reaches business logic.
- Every response uses a consistent envelope/shape; list endpoints are always paginated.
- Public read endpoints are explicitly allow-listed as public; every other endpoint is protected by default (secure-by-default, not secure-by-remembering).
- Admin write endpoints live under `/admin/*` and require `admin` role at the middleware level, not inside each handler.

## 6. Database Rules
- Every foreign key is a real constraint, not an implied relationship in application code only.
- No nullable field without a documented reason (why can it be null, what does null mean).
- Every frequently-filtered/sorted column (slug, isPublished, displayOrder, scheduledSlotStart) is indexed.
- No business value (shipping fee, booking notice, buffer, etc.) is a code constant — it is a row in `BusinessSetting` or an equivalent typed settings table per `architecture.md` §4.1.
- No hard-coded category/brand/banner data anywhere, including seed scripts used for anything beyond local dev fixtures — production taxonomy is created via the Admin Panel.
- Migrations are additive/backward-compatible where possible; destructive migrations require an explicit note in the PR/commit explaining why.

## 7. Error Handling Rules
- All errors pass through the centralized error-handling middleware (`architecture.md` §8) — no ad hoc `res.send(500, err.message)` scattered in handlers.
- User-facing error messages are understandable and action-oriented ("This time slot was just booked — please choose another," not "Error 409").
- Server logs contain full error detail (stack, context, actor); client responses never do, in production.

## 8. Validation Rules
- Validate on both frontend (fast feedback) and backend (source of truth) — frontend validation is never trusted alone.
- File uploads (logos, banners, showcase images, booking attachments, product images) validated for type, max size, and dimensions before storage — enforced server-side regardless of client-side checks.
- Booking creation/reschedule always re-validates slot availability server-side at write time, even if the UI showed it as available seconds earlier (prevents race-condition double-booking).

## 9. Security Rules
- Server-side authorization on every protected and admin endpoint — no exceptions, no "the UI already hides this button" reasoning (`PRD.md` §5.5).
- Ownership checks on any endpoint returning user-specific data (a customer's own orders/bookings/profile) — role check alone is insufficient.
- No secrets, API keys, or credentials committed to the repository — environment variables only, `.env` files git-ignored.
- Passwords hashed with a strong, salted algorithm; never logged or returned in any API response.
- Rate limiting on authentication and review-submission endpoints.
- Every publish/unpublish action and final-price entry is audit-logged (`architecture.md` §4/§10).

## 10. Performance Rules
- No N+1 queries — use eager-loading/joins for list endpoints that render related data (e.g., products with category/brand names).
- No unnecessary re-fetching on the frontend — server-state caching per `architecture.md` §9, not manual polling loops.
- Images (logos, banners, showcase, products) served in responsive sizes with lazy loading below the fold.
- Avoid large unnecessary dependencies; justify any new package addition against what's already available.

## 11. Git Rules
- Small, logically-scoped commits — one feature/fix per commit, descriptive messages.
- No direct commits to the main/production branch — feature branches + review.
- No rewriting shared history without explicit reason and team awareness.

## 12. Testing Rules
- New business logic ships with unit tests (especially: scheduling conflict detection, cancellation-window rules, price-range/final-price transitions, auth/ownership checks).
- New API endpoints ship with an integration test covering at least: success path, validation failure, and unauthorized/unauthenticated access attempt.
- No feature is marked complete without the relevant tests passing — ties to the project's quality gate.

## 13. Dependency Rules
- Justify every new dependency (what it replaces or enables that isn't already available).
- Prefer well-maintained, widely-used libraries over unmaintained or narrow-purpose ones.
- No duplicate libraries solving the same problem (e.g., two different date-handling libraries).

## 14. Code Quality / Anti-Patterns (forbidden)
Duplicate code · very large functions/classes · unnecessary complexity · hard-coded values (especially taxonomy and business settings, per Sections 6 and this document's repeated emphasis) · repeated business logic across layers · tight coupling between modules · dead code · unused imports · mixed responsibilities in one file · copy-paste implementations instead of shared abstractions.

---
**Next document:** `phases.md`.
