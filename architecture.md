# architecture.md — System Architecture
**Document type:** HOW the system is structured
**Location in repo:** `/architecture.md` (repo root, alongside `PRD.md`, `SRS.md`, `rules.md`, `phases.md`, `design.md`, `frontend-plan.md`)
**Depends on:** `PRD.md`

---

## 1. Architecture Style

Modular monolith to start (single deployable backend, clearly separated modules), not microservices — the domain (catalog, booking, scheduling, admin, content) is cohesive enough that microservices would add operational cost without payoff at this scale. Modules are built with strict internal boundaries so they **could** be split later if the business grows (matches the client's "scalable but not over-engineered" instruction).

```
Client Apps (Public Web, Admin Web) 
        │  HTTPS / REST (JSON)
        ▼
   API Layer (versioned: /api/v1)
        │
        ▼
 Application/Service Layer  ── Auth Middleware on every protected route
        │
        ▼
   Domain Modules: Catalog | Taxonomy | Merchandising | Orders | Services |
                    Scheduling | Reviews | ReviewShowcase | Settings | Users
        │
        ▼
   Data Access Layer (repositories/ORM)
        │
        ▼
     Database (relational)  +  Object Storage (images: logos, banners, showcase, product images)
```

## 2. Frontend Architecture

- **Two separate SPAs/apps sharing a component/design-token library**: Public Storefront and Admin Panel. Separate apps (not one app with role-based routes) because their audiences, layout density, and update cadence differ, and it keeps the public bundle lean.
- **State management:** server state (products, categories, brands, banners, bookings, orders) via a cache-aware data-fetching layer (e.g., query/cache library) — never manually duplicated into global state. **Client/UI state** (cart-in-progress, booking wizard step, modal open/closed) via local/component state or a lightweight store, kept separate from server state per separation-of-concerns.
- **No hard-coded taxonomy or promotional content anywhere in frontend code.** Categories, brands, and homepage banners are always fetched from the API at render/build-appropriate time — never imported as static frontend constants or config. This directly satisfies the PRD's "publish and it appears everywhere" requirement.
- **Redirect-and-resume for auth:** an "intended action" is captured in a short-lived, storage-backed pending-action object (target route + serialized step data) *before* redirecting to Sign In. After successful auth, the app reads this object and resumes/replays the action, then clears it. Implementation: the object lives in **`sessionStorage`** under the `pending-action` key with a **5-minute expiry**, and both the route path and the API url it carries are validated by `isSafeInternalPath` / `isSafeApiUrl` on write, on hydration, and again immediately before replay (Section 5.1).

## 3. Backend Architecture

- **Layered:** Controllers/Routes → Services (business logic) → Repositories (data access) → Database. Business logic never lives in controllers or in the frontend.
- **Auth middleware** applied at the route-registration level, not sprinkled ad hoc per handler, so it's impossible to "forget" to protect a new endpoint that belongs to a protected group (Section 5).
- **Domain modules** map to PRD features: `catalog` (products), `taxonomy` (categories, brands), `merchandising` (homepage banners), `orders`, `services`, `scheduling`, `reviews`, `review-showcase`, `settings`, `users/auth`, `notifications`.
- Each module owns its own service + repository; cross-module calls go through service interfaces, never direct cross-module DB queries — keeps coupling low.

## 4. Database Architecture (entities — not exhaustive column-level, that's an implementation task)

**Core:** User, Address, Role
**Catalog/Taxonomy:** Category (id, name, slug, logoImageId, bannerImageId, description, displayOrder, isPublished, parentCategoryId nullable — **required for V1**, self-referencing FK, 2 levels deep: Category → Subcategory, confirmed per PRD §12 item #14), Brand (id, name, slug, logoImageId, isPublished), Product (name, slug, sku, description nullable, price, stockQuantity, brandId FK → Brand nullable, isPublished, **isFeatured** — admin-set merchandising flag, NOT NULL default false, per PRD §4), ProductImage, ProductCategory (join), ProductBrand

> Category queries (public listing, nav, filters) must resolve a subcategory's product scope correctly — a top-level category page shows products from itself **and** all its subcategories; a subcategory page shows only its own. Build this as one reusable query/service method (`CategoryService::getProductScope(categoryId)`), not duplicated per endpoint, per `rules.md` §3 DRY rule. Index `Category.parentCategoryId`.
**Merchandising:** **HomepageBanner** (id, imageId, targetCategoryId FK → Category, displayOrder, isPublished, startAt/endAt nullable for future scheduling, headline/subtitle nullable optional overlay text — max 120/255 chars, `NULL` = image-only banner per PRD §8)
**Commerce:** Cart, CartItem, Order, OrderItem, Wishlist
**Services/Booking:** Service (name, description, priceMin, priceMax, durationMinutes, isPublished), ServiceBooking (status enum, scheduledSlotStart/End, finalPrice nullable-until-completed, cancelledAt, rescheduledFromId), BookingAttachment (optional images per PRD)
**Scheduling:** BusinessHours, Holiday/BlockedSlot, SlotHold (temporary hold during checkout of a slot)
**Reviews:** Review (productId or serviceId, userId, rating, verifiedSource), **ReviewShowcaseItem** (imageId, caption optional, displayOrder, isPublished) — intentionally **not** a subtype of Review; separate table per PRD §6.
**Settings:** BusinessSetting (key, value, type, updatedBy, updatedAt) — a single generic settings table (or typed settings table, see §4.1) backing every configurable value in PRD §9.
**Media:** Asset (id, url, altText, width/height, uploadedBy) — logos, banners, showcase images, product images all reference `Asset`, so storage/CDN logic lives in one place, not duplicated per feature.
**Audit:** AuditLog (entity, entityId, action, actorId, timestamp, metadata) — covers publish/unpublish and final-price entry per PRD §11.

### 4.1 Settings table design note
A generic `BusinessSetting(key, value, type)` table is proposed over one column per setting on a config row, because new operational settings (per PRD's "reasonably change in the future" instruction) can then be added by an admin-panel form + seed, not a schema migration. Strongly-typed read helpers on the backend cast `value` per `type` so application code stays type-safe despite the generic storage. Flagged as a design choice to confirm during Phase 1, not a blocking client decision.

### 4.2 Key indexes/constraints (non-exhaustive, to be finalized during Phase 1 schema review)
- Unique index on `Category.slug`, `Brand.slug`, `Product.sku`.
- Composite index on `ServiceBooking(scheduledSlotStart, scheduledSlotEnd)` plus a DB-level exclusion/overlap constraint (or equivalent application-enforced transaction lock) — this is what makes double-booking *impossible*, not just unlikely, satisfying PRD §9's boundary rule.
- Foreign key `HomepageBanner.targetCategoryId → Category.id` with `ON DELETE RESTRICT` (a category in use by a live banner cannot be silently deleted) or `SET NULL` + admin warning — decision for Phase 1, both keep data integrity; recommend `RESTRICT` with an admin-facing "in use by N banners" warning.

## 5. Authentication & Authorization Architecture

**Implemented default (engineering default, flagged per PRD §12 item #11 — pending client acknowledgment, not silently final):**
- **Stateful SPA cookie session (Laravel Sanctum cookie authentication)** — an `HttpOnly` session cookie plus the `XSRF-TOKEN` double-submit pattern. No bearer tokens are issued to the browser and **no auth credential is stored in `localStorage`**. The client performs a CSRF preflight `GET /sanctum/csrf-cookie` on the API origin before its first state-changing request and echoes the cookie back in `X-XSRF-TOKEN`. Rationale: the only credential an XSS payload can reach is an `HttpOnly` cookie it cannot read or exfiltrate, which removes the token-theft surface a JWT-in-`localStorage` design would create. This *is* the change from the originally proposed access-token + refresh-token design; production cookie/CORS values are enumerated in `SRS.md` §6.2.1.
- Role claim (`customer`, `admin`) is read from the authenticated `User` record (with its `role` relation), not from a client-side token payload; **but role alone is not sufficient authorization** — every protected endpoint additionally checks resource ownership (e.g., a customer can only fetch *their own* order/booking — prevents IDOR).
- Admin Panel endpoints require `admin` role **and** are served from a separate route namespace (`/api/v1/admin/*`) so a single middleware guard covers the entire admin surface — reduces the chance of an unguarded admin endpoint.
- Public read endpoints (catalog, categories, brands, banners, published reviews, showcase, the flat shipping fee) explicitly bypass auth middleware — allow-list, not a default-open API, so "public" is a deliberate declaration per route, not an accidental omission of a guard.

### 5.1 Resume-after-login mechanics (implemented)
1. Frontend attempts a protected action → API returns `401` → frontend serializes current step/state into the pending-action object (Section 2) and redirects to `/login`, passing the current location as router state (`from`), not as a query parameter.
2. Storage contract: the pending action is written to **`sessionStorage`** with a **5-minute TTL**. It is deliberately *not* `localStorage` — a pending action is short-lived and tab-scoped, and must not outlive the browsing session or leak across tabs on a shared machine.
3. Validation is applied at **three separate points**, all through the same two guards (`packages/api-client/src/utils/safe-path.ts`): on **write** (before the value is stored), on **hydration** (when it is read back out of `sessionStorage`), and again on **replay** (immediately before it is used). A value must have a **single leading slash**, and must not contain `//`, a backslash, `://`, or any control character, and must be **≤ 2048 characters**. Routes use `isSafeInternalPath`; replayed API urls use `isSafeApiUrl`. This triple check exists because the value is attacker-influenceable in three different ways (torn/stale storage, a crafted `location.state`, a mutated object), and one check cannot cover all three.
4. The `RequireAuth` route guard **waits on `isSessionChecked`** before deciding anything. It must not redirect based on the initial `isAuthenticated === false` value, because that value simply means "not checked yet" — a redirect fired before `GET /auth/user` resolves would bounce an already-authenticated user to the login page. The one-time session check itself is latched per app load (`SessionBootstrap`), so the guard never triggers a second `fetchUser()`.
5. Post-auth destination order is fixed and shared by the login and register pages through a single hook (`usePostAuthNavigation`): replay the pending action if one exists → otherwise use the router's `from`, **re-validated through `isSafeInternalPath`** (a crafted `from` such as `https://evil.test` degrades to `/` rather than becoming an open redirect) → otherwise `/`. A `replace: true` navigation is used so the login page never sits in browser history.
6. Backend never trusts the frontend's replay blindly — the resumed request goes through the exact same validation/authorization as any fresh request, and the frontend's guards are an XSS/open-redirect hygiene measure only, never an authorization boundary.
7. A failed replay is reported to the user through a **coarse reason** (`RESUME_FAILED_NOTICE`, one generic "we couldn't complete your last action, please try again" message) and **never raw error text** — a replay failure can be a 401, a 422, a stock conflict or a network drop, and surfacing any of those verbatim to the user would leak implementation detail and confuse them. The underlying error is still logged for diagnosis.

### 5.2 Replay policy (engineering default, flagged)
This is a deliberate split, and it is the part most likely to need client sign-off:

- **Auto-replayed after login** — only add-to-cart (and equivalent reversible, idempotent cart operations). Replaying it is invisible to the user and cannot create a duplicate charge, a duplicate order, or a duplicate booking. **Wishlist toggle is NOT auto-replayed:** the wishlist API is toggle-only (not idempotent), so replaying a guest's intent could *remove* an item the account already had; a guest's heart instead returns them to the same page after login to re-toggle deliberately.
- **Never auto-replayed** — checkout, order placement, and the booking wizard. For these the app restores only the **route plus the entered step data** and then requires the user to **confirm again**. A silently-replayed order placement would create a real financial commitment the user never re-confirmed, and a replayed booking would consume a real technician slot.
- The booking wizard route (`/booking`) is therefore **intentionally not route-guarded**. Guarding it would force a login before the user has entered anything, and — because there is nothing safe to auto-replay — the resumed user would simply land back on step 1. The gate is placed at the **confirm step** instead, which is also the only point where a real commitment happens.
- **Buy Now is a cart add plus a route restore, never a shortcut past confirm.** It reuses the same add-to-cart action (so a guest's deferral is still auto-replayed) but always carries `targetRoute="/checkout"`, so a signed-in shopper's line is added and they land on checkout — which still requires an explicit confirm click. No order is ever placed by Buy Now, and existing cart lines are never cleared.
- Any future action added to the resume system must be classified against this policy before it is allowed to auto-replay.

## 6. Taxonomy & Merchandising — "No Hard-Coding" Enforcement

To satisfy PRD §7/§8's hard constraint:
- Frontend has **zero** static lists of categories/brands/banners — every relevant page/section calls `GET /api/v1/categories?published=true`, `GET /api/v1/brands?published=true`, `GET /api/v1/homepage-banners?published=true` at request time (with standard HTTP caching, not build-time baking).
- Category/Brand filter options on the Shop page are generated from the same live taxonomy endpoints used for navigation — one source of truth, not a duplicated filter config.
- `HomepageBanner.targetCategoryId` is resolved to a live category slug **at click time** via the API response (banner payload includes the current category slug), so an admin re-pointing a banner takes effect immediately with no cache-busting logic needed on the frontend beyond normal short-TTL caching.

## 7. API Structure

- REST, versioned under `/api/v1`.
- Resource-oriented routes: `/products`, `/categories`, `/brands`, `/homepage-banners`, `/services`, `/shipping-fee`, `/bookings`, `/orders`, `/cart`, `/wishlist`, `/reviews`, `/review-showcase`, `/settings`, `/auth/*`, mirrored under `/admin/*` for admin-only write operations where behavior differs (e.g., `/admin/categories` for CRUD vs. public read-only `/categories`).
- Standard response envelope with pagination metadata for list endpoints (catalog, orders, bookings, admin lists).
- Input validation at the API boundary (schema validation library) before hitting service layer — rejects malformed requests before any business logic runs.

## 8. Error Handling Strategy

- Centralized error-handling middleware maps known error types (ValidationError, AuthError, NotFoundError, ConflictError e.g. slot-taken, BusinessRuleError e.g. cancellation-window-passed) to consistent HTTP codes + user-safe messages.
- Unknown/unexpected errors are logged with full detail server-side and returned to the client as a generic, non-leaking message — no stack traces in production responses (PRD/NFR requirement).

## 9. State Management Strategy (frontend)
Server-state cache (products/categories/brands/banners/bookings) with sensible TTL/invalidation on admin mutations; local component state for transient UI; a small global store only for cross-cutting concerns (auth session, cart summary badge, pending-action object).

## 10. Security Considerations
- Server-side authorization on every protected/admin route (PRD §5.5) — allow-list-based public routes (Section 5).
- Ownership checks (not just role checks) on order/booking detail endpoints.
- File upload validation (type, size, dimension) on all image uploads — logos, banners, showcase, booking attachments, product images — routed through the single `Asset` module so validation logic isn't duplicated four times.
- Rate limiting on auth endpoints and review submission, plus a named `service-availability` limiter on the unauthenticated `GET /api/v1/services/{slug}/availability` read (keyed by IP + slug): it is public but walks business hours and live holds/bookings per call.
- Parameterized queries/ORM only — no raw string-concatenated SQL.
- Admin publish/unpublish and final-price actions are audit-logged (Section 4).

## 11. Performance Considerations
- Indexes per Section 4.2.
- Image delivery: responsive sizes + lazy loading for below-the-fold logos/banners/showcase images (PRD §11).
- List endpoints (catalog, orders, bookings) paginated by default, never "return everything."
- Scheduling-engine slot-availability queries pre-aggregated/cacheable per day rather than recomputed from raw bookings on every request where feasible.

## 12. Scalability Considerations
- Single-technician assumption is a **data value**, not a structural one — `ServiceBooking.technicianId` exists from V1 (nullable/defaulted to the one technician), so multi-technician support later is a UI/assignment-logic addition, not a schema migration.
- Settings-table design (Section 4.1) allows new configurable business values without migrations.
- Modular monolith boundaries (Section 3) allow extracting a module (e.g., Scheduling) into its own service later if load requires it.

## 13. Folder/Project Structure (proposed, confirmed at Phase 1 kickoff)

```
/docs                      → PRD.md, architecture.md, rules.md, phases.md, design.md
/apps
  /storefront               → public customer-facing app
  /admin                     → admin panel app
/packages
  /ui                        → shared design-system components (Button, Card, Carousel, etc.)
  /api-client                → typed API client shared by both apps
/server
  /app
    /Modules                  → one PascalCase directory per domain module
      /Catalog
      /Taxonomy               → categories, brands
      /Merchandising           → homepage banners
      /Orders
      /Services
      /Scheduling
      /Reviews
      /ReviewShowcase
      /Settings
      /Users
      /Notifications
    /Models                    → Eloquent models
    /Http                      → controllers, middleware, requests
    /Shared, /Support          → asset/upload service, audit logger, helpers
    /Console, /Providers
  /database
    /migrations
/infra                        → deployment/config (Phase 11)
```

---
**Next document:** `rules.md`.