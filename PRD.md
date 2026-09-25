# PRD — Product Requirements Document
**Project:** Pakistani Tech Store + Doorstep IT Service Booking Platform
**Document type:** WHAT are we building
**Status:** v1.1 — supersedes v1.0; adds Brand/Category Visual Management & Homepage Hero Banners
**Location in repo:** `/docs/PRD.md`

---

## 1. Purpose & Problem Statement

A Pakistani computer/technology store with an established physical shop has no online presence and no digital way for customers to book doorstep IT support. This platform gives the business two revenue channels under one brand:

1. An **online store** for computer hardware/accessories (COD-only in V1).
2. A **doorstep IT service booking system** with admin-managed services, price-range quoting, and a smart scheduling engine that prevents double-booking.

## 2. Target Users

- **Guest visitor** — anonymous, browsing only.
- **Customer** — registered/authenticated; transacts (buy, book, review, manage account).
- **Admin** — the client (currently the sole technician) and any future staff; manages catalog, services, orders, bookings, scheduling, settings, Review Showcase, and now Brand/Category/Banner visual assets.
- *(Future: Technician role, distinct from Admin — not built in V1.)*

## 3. Goals

- A credible, conversion-oriented storefront that doesn't look like a generic template.
- Booking a doorstep service as easy as buying a product.
- Full operational control for the admin — catalog, services, scheduling, settings, and **all visual merchandising (brand logos, category imagery, homepage banners)** — with zero developer involvement for routine changes.
- An architecture where **nothing customer-facing about brands, categories, or promotions is hard-coded** — publishing in the admin panel is the only step required to go live.

## 4. Core Features (Modules)

1. Product Catalog & Search
2. Cart & COD Checkout
3. Order Management (customer + admin)
4. Wishlist
5. Service Catalog (admin CRUD, price range + duration)
6. Smart Guided Service Booking
7. Availability/Scheduling Engine
8. Customer Account
9. Admin Panel
10. Notifications (Website + Email)
11. Product & Service Reviews (customer-submitted, verified-only)
12. Customer Review Showcase (admin-curated social-proof carousel)
13. Configurable Business Settings
14. **Brand & Category Visual Management** *(new)*
15. **Homepage Hero Banner Management** *(new)*

---

## 5. Authentication & Access Control — Business Rule

### 5.1 Public (no auth required)
Guests may **view**: Homepage, Products/Shop, Categories, Brands, Product Detail, Search & Filter results, Services, Service Detail, published Product/Service Reviews (read-only), Review Showcase carousel, and Homepage Hero Banners.

### 5.2 Protected (auth required)
Enforced **server-side on every corresponding API endpoint**:
Add to Cart, Buy Now, Checkout, Place Order, Wishlist (add/remove/view), Service Booking (create), Booking Cancellation, Booking Rescheduling, Order History, Order Detail, Service Booking History, Booking Detail, Profile Management, Address Management, Review Submission.

### 5.3 Guest Checkout
**Not included.** Login/registration is required before Place Order.

### 5.4 Redirect-and-Resume Behavior
On a blocked action: capture intended destination **and all in-progress step data** (e.g., partially completed booking wizard, item pending cart-add) → redirect to Sign In/Sign Up → on success, resume exactly where the guest left off, not the homepage.

*(Open item #11 in Section 12: exact session/token mechanism — proposed and flagged, not assumed, in `architecture.md` §5.)*

### 5.5 Enforcement Requirement
Frontend route guards are UX convenience only. Every protected endpoint independently verifies the session server-side — non-negotiable, detailed in `architecture.md` and `rules.md`.

---

## 6. Customer Review Showcase (Admin-Curated Social Proof)

Distinct from, and never merged with, the database-backed Product/Service Review system (#11).

- **Admin:** upload, edit, delete, reorder, publish/unpublish showcase images.
- **Public:** horizontal auto-scrolling carousel, published-order only.
  - Desktop: pause on hover, resume on pointer-leave.
  - Touch: swipe navigation, pause during active touch.
  - Continuous loop.
  - Click/tap opens a keyboard-dismissible, screen-reader-accessible lightbox.
- Unpublished items must be unreachable via public API (IDOR-safe), not just hidden in UI.
- Own data entity (`ReviewShowcaseItem`) — no join to the Reviews table.

---

## 7. Brand & Category Visual Management *(new)*

### 7.1 Brands
- Admin creates/edits a brand with: name, slug, **logo upload**, publication status.
- Brand logos render dynamically in (a) the public "Shop by Brand" section and (b) brand filter controls on the Shop page — sourced from the database, never hard-coded image paths.
- Brand cards/logos are clickable → navigate to that brand's product listing (`/shop/brand/{slug}`).
- Unpublishing a brand removes it from all public sections and filters immediately, without a code deploy.

### 7.2 Categories
- Admin creates/edits a category with: name, slug, **logo/image**, optional **banner image**, description, display order, publication status.
- Category logos render dynamically in the public "Shop by Category" section, ordered by admin-defined display order.
- Category cards are clickable → navigate to that category's product listing (`/shop/category/{slug}`).
- Category assets (logo, banner, name, slug) are never hard-coded in frontend code or config — 100% database-driven.
- **Subcategory support is required in V1** (confirmed, Section 12 item #14): a category may have a `parentCategoryId`. The public "Shop by Category" section, category listing pages, and Shop-page filters must all support at least 2 levels (Category → Subcategory), with subcategories inheriting/narrowing the parent's product scope. Admin category CRUD (Section 7.2 fields) includes an optional "Parent Category" selector.

### 7.3 Universal rule
**If an admin creates and publishes a new brand or category, it must appear in every relevant public section (listings, filters, navigation, homepage "Shop by Category/Brand") automatically — zero frontend code changes required.** This is a hard architectural constraint, not a nice-to-have, and will be reflected in `architecture.md` as a "no hard-coded taxonomy" rule.

---

## 8. Homepage Hero Banner Management *(new)*

- Dedicated Admin Panel section: **Homepage Hero Banners**.
- Admin can upload, edit, delete, reorder, publish/unpublish, and configure each banner.
- **Each banner is linked to a target category via a real database relationship (foreign key)** — not a hard-coded URL. If the admin later changes which category a banner points to, the destination updates automatically with no code change.
- Public behavior:
  - Auto-slides horizontally.
  - Previous/Next manual controls.
  - Touch/swipe support.
  - Pauses on hover (desktop), resumes on pointer-leave.
  - Only **published** banners appear, in admin-defined order.
- Clicking a banner navigates to the currently associated category's product listing page — resolved at click-time from the live relationship, so a category swap is reflected instantly.

---

## 9. Configurable Business Settings

| Setting | Notes |
|---|---|
| Shipping fee | Admin-configurable |
| Minimum booking notice | Admin-configurable |
| Service buffer time | Admin-configurable |
| Cancellation/reschedule cutoff | Admin-editable window; hard stop at "Technician On The Way" is a **system rule**, not admin-editable |
| Business hours & holidays | Per-weekday hours + holiday/blocked-date calendar |
| Serviceable areas | Admin-configurable |
| Product categories & brands | Fully admin-managed, including all visual assets (Section 7) |
| Homepage hero banners | Fully admin-managed (Section 8) |
| Notification preferences | Website + Email in V1 |

**Boundary rule (unchanged):** admin settings tune business policy values; they can never weaken double-booking prevention, authorization enforcement, or data-integrity constraints — these remain hard-enforced in application/database logic.

---

## 10. Confirmed Business Rules

| Area | Rule |
|---|---|
| Service pricing | Price range (min–max) at booking; technician enters final actual price on completion |
| Service payment | Cash on completion |
| Product payment | COD only, V1 |
| Cancellation/reschedule | Customer: up to 2 hrs pre-slot; blocked after "Technician On The Way"; Admin can always override |
| Technician assignment | Single technician (client), manually assigned; data model not hard-coded to single-technician |
| Wishlist | Included; login required |
| Guest checkout | Not included |
| Review eligibility | Verified purchase (product) or completed booking (service) only |
| Notifications | Website + Email, V1 |
| Taxonomy & merchandising | Brands, categories, and homepage banners are 100% database-driven and admin-published (Sections 7–8) |

## 11. Non-Functional Requirements
- WCAG 2.2 AA across storefront and admin, including all new carousels (Review Showcase, Hero Banners) — keyboard-operable controls, visible focus states, adequate contrast, reduced-motion consideration for auto-sliding content.
- API-level authorization on every protected/admin endpoint.
- Responsive: desktop, tablet, mobile — intentionally designed per breakpoint, including touch/swipe behavior for both carousels.
- Performance: image optimization for logos/banners (responsive image sizes, lazy loading below the fold), optimized queries/indexes, no unnecessary re-renders.
- Auditability: status changes on orders/bookings, final-price entry, and publish/unpublish actions on brands/categories/banners/showcase items should be logged (who/when).

## 12. Outstanding Decisions Log

| # | Decision | Status |
|---|---|---|
| 1–10 | (Wishlist, guest checkout, shipping fee, serviceable areas, booking file upload, notifications, min. booking notice, review eligibility, taxonomy ownership) | ✅ Resolved — see Section 10 and `00-PRODUCT-DEFINITION.md` |
| 11 | Exact session/token strategy | Proposed default in `architecture.md` §5, flagged for confirmation |
| 12 | Exact scope of "resume after login" state | Default: preserve **all** entered step data, not just current step — flagged for confirmation |
| 13 | Review Showcase image limits (count, aspect ratio, file size cap) | ✅ Resolved (engineering default) — reuses existing Asset validation (jpg/jpeg/png/webp, 2MB, FileUploadService), max dimensions defaulted to 2000×2000 (product preset, not separately specified in SRS §3.4), no hard cap on item count (a frontend carousel-display concern, not backend). Flagged for eventual client confirmation, no urgency — consistent with this project's existing default-setting precedent. |
| 14 | Category hierarchy | ✅ Resolved — **parent/child subcategories required in V1** (not deferred to future scope) |
| 15 | Homepage Hero Banner count limit and recommended image dimensions | ✅ Resolved — defaults in `design.md`/`SRS.md` accepted |
| 16 | Refund/return policy exact terms | ⚠️ **CLIENT_DECISION_REQUIRED** — content/legal, not an architecture blocker |
| 17 | Admin panel URL pattern | ✅ Resolved — **admin.yoursite.com subdomain** |
| 18 | Hostinger plan tier | ✅ Confirmed — SSH + Composer + PHP 8.3 available |
| 19 | Review moderation workflow (customer-review auto-publish vs. review-before-publish) | ✅ Resolved — reviews auto-publish on submission (verified purchase/booking is the gate); admin can unpublish/republish any review afterward. Confirmed by client during Phase 10 planning. |
| 20 | Notification preference model: website notifications always recorded (not user-toggleable); email sending gated by a single global BusinessSetting `email_notifications_enabled` (default true), admin-wide not per-customer — confirmed by client. | ✅ Resolved — confirmed by client during Phase 11 planning. |

---

## 13. Success Criteria
- A guest can browse the full public catalog/services/reviews/banners with zero forced login.
- Any protected action, however attempted, is blocked server-side and correctly resumes post-login with no lost progress.
- Admin can change shipping fee, booking notice, buffer, hours, holidays, service areas, categories, brands, and homepage banners with **no code change and no developer involvement**.
- Publishing a new brand/category/banner in the admin panel makes it live everywhere relevant (listings, filters, nav, homepage) immediately.
- Review Showcase and customer-submitted Reviews remain architecturally and visually distinct.
- Double-booking is impossible regardless of any admin setting.

---
**Next document:** `architecture.md`.