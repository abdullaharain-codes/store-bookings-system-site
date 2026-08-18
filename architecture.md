# architecture.md — System Architecture
**Document type:** HOW the system is structured
**Location in repo:** `/docs/architecture.md`
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
- **Redirect-and-resume for auth:** an "intended action" is captured in a short-lived, storage-backed pending-action object (target route + serialized step data) *before* redirecting to Sign In. After successful auth, the app reads this object and resumes/replays the action, then clears it.

## 3. Backend Architecture

- **Layered:** Controllers/Routes → Services (business logic) → Repositories (data access) → Database. Business logic never lives in controllers or in the frontend.
- **Auth middleware** applied at the route-registration level, not sprinkled ad hoc per handler, so it's impossible to "forget" to protect a new endpoint that belongs to a protected group (Section 5).
- **Domain modules** map to PRD features: `catalog` (products), `taxonomy` (categories, brands), `merchandising` (homepage banners), `orders`, `services`, `scheduling`, `reviews`, `review-showcase`, `settings`, `users/auth`, `notifications`.
- Each module owns its own service + repository; cross-module calls go through service interfaces, never direct cross-module DB queries — keeps coupling low.

## 4. Database Architecture (entities — not exhaustive column-level, that's an implementation task)

**Core:** User, Address, Role
**Catalog/Taxonomy:** Category (id, name, slug, logoImageId, bannerImageId, description, displayOrder, isPublished, parentCategoryId nullable — **required for V1**, self-referencing FK, 2 levels deep: Category → Subcategory, confirmed per PRD §12 item #14), Brand (id, name, slug, logoImageId, isPublished), Product, ProductImage, ProductCategory (join), ProductBrand

> Category queries (public listing, nav, filters) must resolve a subcategory's product scope correctly — a top-level category page shows products from itself **and** all its subcategories; a subcategory page shows only its own. Build this as one reusable query/service method (`CategoryService::getProductScope(categoryId)`), not duplicated per endpoint, per `rules.md` §3 DRY rule. Index `Category.parentCategoryId`.
**Merchandising:** **HomepageBanner** (id, imageId, targetCategoryId FK → Category, displayOrder, isPublished, startAt/endAt nullable for future scheduling)
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

**Proposed default (flagged per PRD §12 item #11, needs confirmation, not silently final):**
- Token-based session (e.g., short-lived access token + longer-lived refresh token, HttpOnly secure cookie for refresh) rather than long-lived JWT-in-localStorage, to reduce XSS token-theft risk.
- Role claim (`customer`, `admin`) embedded in the token; **but role alone is not sufficient authorization** — every protected endpoint additionally checks resource ownership (e.g., a customer can only fetch *their own* order/booking — prevents IDOR).
- Admin Panel endpoints require `admin` role **and** are served from a separate route namespace (`/api/v1/admin/*`) so a single middleware guard covers the entire admin surface — reduces the chance of an unguarded admin endpoint.
- Public read endpoints (catalog, categories, brands, banners, published reviews, showcase) explicitly bypass auth middleware — allow-list, not a default-open API, so "public" is a deliberate declaration per route, not an accidental omission of a guard.

### 5.1 Resume-after-login mechanics
1. Frontend attempts a protected action → API returns `401` → frontend serializes current step/state into the pending-action object (Section 2) → redirects to `/login?next=...`.
2. On successful login, frontend reads the pending-action object, re-issues the original request (now authenticated) or restores the wizard step, then clears the object.
3. Backend never trusts the frontend's replay blindly — the resumed request goes through the exact same validation/authorization as any fresh request.

## 6. Taxonomy & Merchandising — "No Hard-Coding" Enforcement

To satisfy PRD §7/§8's hard constraint:
- Frontend has **zero** static lists of categories/brands/banners — every relevant page/section calls `GET /api/v1/categories?published=true`, `GET /api/v1/brands?published=true`, `GET /api/v1/homepage-banners?published=true` at request time (with standard HTTP caching, not build-time baking).
- Category/Brand filter options on the Shop page are generated from the same live taxonomy endpoints used for navigation — one source of truth, not a duplicated filter config.
- `HomepageBanner.targetCategoryId` is resolved to a live category slug **at click time** via the API response (banner payload includes the current category slug), so an admin re-pointing a banner takes effect immediately with no cache-busting logic needed on the frontend beyond normal short-TTL caching.

## 7. API Structure

- REST, versioned under `/api/v1`.
- Resource-oriented routes: `/products`, `/categories`, `/brands`, `/homepage-banners`, `/services`, `/bookings`, `/orders`, `/cart`, `/wishlist`, `/reviews`, `/review-showcase`, `/settings`, `/auth/*`, mirrored under `/admin/*` for admin-only write operations where behavior differs (e.g., `/admin/categories` for CRUD vs. public read-only `/categories`).
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
- Rate limiting on auth endpoints and review submission.
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
  /src
    /modules
      /catalog
      /taxonomy               → categories, brands
      /merchandising           → homepage banners
      /orders
      /services
      /scheduling
      /reviews
      /review-showcase
      /settings
      /users
      /notifications
    /middleware               → auth, error-handler, validation
    /shared                    → asset/upload service, audit logger
  /migrations
/infra                        → deployment/config (Phase 11)
```

---
**Next document:** `rules.md`.