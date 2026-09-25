# SRS.md — Software Requirements Specification
**Project:** Pakistani Tech Store + Doorstep IT Service Booking Platform
**Location in repo:** `/docs/SRS.md`
**Depends on / consolidates:** `PRD.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`
**Purpose of this document:** answer, in one place, *what the final production system will actually be* — the exact stack, why that stack, how file storage works without Cloudinary, and the exact path from code to a live Hostinger deployment.

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the complete technical specification of the system: architecture, technology stack, database, file storage strategy, APIs, non-functional requirements, and the full deployment pipeline to Hostinger. Where earlier documents (`architecture.md`) described structure conceptually, this document makes the **final, concrete technology decisions** and locks the deployment model.

### 1.2 Scope
Covers the public storefront, the doorstep IT service booking system, the admin panel, and everything required to take the codebase from local development to a live Hostinger production deployment.

### 1.3 Intended Audience
Developers (human or AI-assisted, e.g., Claude Code) implementing the system; the client, for sign-off on the deployment model and stack.

---

## 2. Tech Stack Decision — Final

### 2.1 Constraint driving this decision
**Hosting target is Hostinger** (not a cloud-native platform like AWS/Vercel/Render). No third-party media service (Cloudinary, S3, etc.) — all uploaded files must be stored **on the server's own disk** and served directly. The stack must therefore be one that:
- Deploys cleanly on Hostinger's PHP/MySQL-first hosting environment (shared hosting or Hostinger VPS/Cloud, both of which are PHP-optimized by default with cPanel/hPanel).
- Writes/reads local files reliably without needing a separate object-storage service.
- Is fast to develop, has a mature ecosystem for exactly this kind of app (catalog + orders + booking/scheduling + admin panel), and is easy for future developers to maintain.

### 2.2 Stack comparison (why Laravel + MySQL wins for this constraint)

| Option | Fit for Hostinger + local storage | Verdict |
|---|---|---|
| **Laravel (PHP 8.x) + MySQL** | Native fit — Hostinger's hosting stack is built around PHP/MySQL; Laravel's built-in `Storage` (local disk driver), Eloquent ORM, queues, validation, and auth scaffolding map directly onto everything this project needs (settings table, audit logs, scheduling logic, file uploads). Deploys via standard PHP hosting (cPanel/Git deploy) with no extra process manager needed. | **✅ Selected** |
| Node.js/Express + PostgreSQL | Needs Hostinger VPS with Node runtime + process manager (PM2) configured manually; more moving parts to keep alive on a budget host; local file storage works but has to be hand-rolled (Laravel gives it out of the box). | Viable but more deployment overhead for no functional benefit here |
| Next.js full-stack (Node) | Same VPS/Node requirement as above, plus serverless-first frameworks like Next.js are optimized for platforms (Vercel) that assume ephemeral/no-persistent-disk — actively works against the "store files on local disk" requirement. | ❌ Not selected |
| Django (Python) + PostgreSQL | Good framework, but Hostinger's shared/entry hosting is not Python-first (needs Passenger/WSGI config, less turnkey than PHP there); no material advantage over Laravel for this project's needs. | Not selected |

**Final Decision:**
- **Backend:** Laravel (runtime 13.25.0; composer constraint `laravel/framework` `^13.17`), PHP (runtime 8.5.9; composer constraint `php` `^8.3`), REST API (`/api/v1`), Sanctum for token-based auth (fits the `architecture.md` §5 access-token model), Eloquent ORM.
  - **Deployment note:** the composer `php` `^8.3` constraint is the deployment-compatibility floor, but the dev machine runs PHP 8.5.9 and the codebase is only verified against that runtime so far. Before go-live (Phase 13 concern — flag only) either pin Hostinger's PHP to the tested version (8.5.9) or re-verify the full suite on the pinned production version.
- **Database:** MySQL 8 (Hostinger's default/most supported DB engine).
- **Frontend (Storefront + Admin):** React 18 + Vite, built as **static SPA bundles** — no Node server needed in production, the built `dist/` output is just static files served by Hostinger, which is the simplest and most reliable pattern on shared/budget hosting. Two separate Vite apps per `architecture.md` §2 (`/apps/storefront`, `/apps/admin`), sharing a `/packages/ui` component library.
- **State/data-fetching:** TanStack Query (server-state cache) + Zustand (small global client state — auth session, cart badge, pending-action object) per `architecture.md` §9.
- **File storage:** Laravel's local disk driver — see Section 3 (this is the direct answer to your storage requirement).
- **Queue/Notifications:** Laravel's database queue driver (no Redis dependency required — keeps hosting requirements minimal) for email/website notifications (`architecture.md` module `notifications`).
- **Session/Auth tokens:** Laravel Sanctum, short-lived access token + refresh pattern, HttpOnly cookie for refresh — matches the proposal in `architecture.md` §5 (still flagged there as PRD open item #11 for final client confirmation, now technically anchored to Sanctum specifically).

### 2.3 Why this is the fast + accurate choice
- Laravel is a mature, batteries-included framework — auth, validation, ORM, migrations, queues, file storage, and authorization (policies/gates) are all first-party, not third-party packages stitched together. That means less custom code to write and fewer integration bugs = faster *and* more accurate delivery than assembling an equivalent Node stack from smaller libraries.
- MySQL + Eloquent gives straightforward relational modeling for exactly the entities in `architecture.md` §4 (Category, Brand, HomepageBanner with FK, ServiceBooking with overlap constraints, BusinessSetting, Asset, AuditLog).
- A static-built React SPA frontend means **zero Node process to keep running in production** on Hostinger — just files. This removes an entire category of hosting failure (crashed Node process, PM2 misconfiguration) that a Node backend or Next.js server would introduce.

---

## 3. Centralized File Upload & Storage System (Local Disk — No Cloudinary/S3)

### 3.1 Design goal
One single, reusable upload mechanism used by **every** feature that accepts images (products, brands, categories, homepage banners, review showcase, booking attachments) — never a one-off upload handler per feature. This is the same `Asset` module concept from `architecture.md` §4/§10, now made concrete for local-disk storage.

### 3.2 Folder structure (as you specified, confirmed and extended slightly)
```
/home/app/
    backend/                      → Laravel application root
        app/
        routes/
        ...
    storage/
        uploads/
            products/
            brands/
            categories/
            categories/banners/       → category page banners, kept distinct from category logos
            homepage/                 → homepage hero banners
            review-showcase/
            booking-attachments/
```
Each top-level folder under `uploads/` corresponds 1:1 to a feature area from the PRD. This keeps files organized, makes backups/cleanup per-feature simple, and makes it obvious in a file listing what belongs to what — exactly the reasoning behind your proposed structure.

### 3.3 How it works technically (Laravel local disk driver)
- A single `FileUploadService` (backend `shared/` module, per `architecture.md` §13) exposes one method, e.g. `store(UploadedFile $file, string $category): Asset`, where `$category` is one of `products|brands|categories|categories/banners|homepage|review-showcase|booking-attachments`.
- Internally this uses Laravel's `Storage::disk('uploads')->putFile($category, $file)` — the disk is configured once in `config/filesystems.php` to point at `storage/uploads`, so every feature module calls the *same* service instead of writing its own file-handling code (directly enforces `rules.md` §4/§9 "no duplicated upload logic").
- Every stored file is recorded as a row in the `Asset` table (`architecture.md` §4: id, url/path, altText, width/height, uploadedBy) — the database is always the source of truth for *which files are actually in use*, never the filesystem alone. This is what lets an admin "delete" an image safely (soft-delete the Asset row, optionally garbage-collect the physical file on a schedule) without breaking references.
- Filenames are stored as generated **UUIDs + original extension** (e.g., `8f3a1c2e-....jpg`), never the user's original filename — avoids collisions, avoids path-traversal/malicious-filename issues, and avoids leaking any information from the original filename.
- Public access is served through a **symlinked public path** (`php artisan storage:link`, Laravel's standard pattern) so uploaded files are reachable at a public URL (`https://yourdomain.com/storage/uploads/products/...`) without exposing the rest of the storage directory.

### 3.4 Validation (enforced server-side, per `rules.md` §8/§9, regardless of any frontend check)
| Rule | Value (default — confirm with client if different limits are wanted) |
|---|---|
| Allowed types | `jpg, jpeg, png, webp` (no raw `svg` upload — SVG can carry executable script content; if a brand/category truly needs vector logos, convert server-side or restrict to sanitized SVG only) |
| Max file size | 2 MB for logos/product/showcase images, 4 MB for hero/category banners |
| Max dimensions | Logos: 1024×1024px · Banners: 2400×1200px · Product images: 2000×2000px — oversized uploads are rejected with a clear error, not silently resized in a way that surprises the admin |
| MIME-type check | Verified server-side against actual file content, not just the file extension (prevents disguised-file uploads) |

### 3.5 Delivery/performance
- Since there's no CDN by default on this setup, images should be **pre-optimized on upload** (server-side resize/compress via Laravel's Intervention Image package or similar) so the site stays fast without depending on an external image service — this directly supports `design.md`/`architecture.md`'s "lazy loading + responsive images" performance requirement even without Cloudinary.
- Recommend generating **two sizes per uploaded image** (e.g., a `thumbnail` and a `full` variant) at upload time, both stored under the same feature folder, so listing pages (Shop grid, category grid) never have to download full-resolution banner-sized images just to show a small card.

### 3.6 Backup consideration
Because files live on the server's disk (not a redundant object store), **the deployment plan (Section 6) explicitly includes scheduled backups of `storage/uploads/` alongside database backups** — this is the one real trade-off of avoiding Cloudinary/S3, and it must not be silently skipped. Hostinger hPanel provides scheduled backup tooling; this should be enabled from day one of production, not added later.

### 3.7 Additional recommendations (answering "baqi kya karna chahiye")
- **Never** allow the upload folder itself to execute code: add a `.htaccess` (or Nginx equivalent) inside `storage/uploads/` denying PHP execution, so even if a malicious file were somehow uploaded, it cannot run.
- Increase PHP's `upload_max_filesize` / `post_max_size` / `max_execution_time` in Hostinger's PHP config to comfortably exceed Section 3.4's limits (with headroom), otherwise uploads silently fail at the server level before your validation even runs.
- Log every upload/delete action to the `AuditLog` table (who uploaded/deleted what, when) — ties into the audit requirement already in `architecture.md`/`PRD.md`.
- Keep the **`Asset` table's path field relative**, not an absolute server path or a hard-coded domain — makes moving to a different Hostinger plan, or to object storage later, a configuration change instead of a data migration.
- This design is intentionally **swap-able later**: if the business outgrows single-server disk storage, the `FileUploadService` interface stays the same and only its internal disk driver changes (e.g., to S3-compatible storage) — no feature code elsewhere needs to change. This satisfies `architecture.md`'s scalability principle without paying the Cloudinary complexity/cost cost now.

---

## 4. Functional Requirements
Fully specified in `PRD.md` §4–§10 (Catalog, Cart/Checkout, Orders, Wishlist, Services, Booking, Scheduling, Account, Admin, Notifications, Reviews, Review Showcase, Brand/Category Visual Management, Homepage Hero Banners). This SRS does not repeat them — it anchors them to the concrete Laravel/MySQL/React implementation described above.

## 5. External Interface Requirements
- **API:** REST, `/api/v1`, JSON request/response, per `architecture.md` §7 — implemented as Laravel API routes/controllers/Form Requests (validation) /API Resources (response shaping).
- **Admin API:** `/api/v1/admin/*`, guarded by Sanctum + an `admin` middleware group (`architecture.md` §5).
- **File URLs:** served from `/storage/uploads/...` via the public symlink (Section 3.3) — frontend never constructs upload paths manually, always uses the URL returned by the API/Asset record.

## 6. Deployment Plan — Local → Production on Hostinger

### 6.1 Hostinger plan requirement
A plan with **SSH access, Git deployment or file manager, PHP 8.3, MySQL, and Composer support** — Hostinger's Business/Cloud/VPS hosting tiers support this (confirm current tier with the client's actual Hostinger plan; entry-level shared plans may lack SSH/Composer access and would need an upgrade).

### 6.2 Pipeline (step by step)
1. **Backend build:** run `composer install --optimize-autoloader --no-dev` on the server (or upload a pre-built vendor directory if Composer isn't available on the plan).
2. **Environment config:** set `.env` on the server with production DB credentials, `APP_ENV=production`, `APP_DEBUG=false` (never expose stack traces per `rules.md` §7), correct `APP_URL`, mail credentials for notifications, and the local filesystem disk path.
3. **Database:** run `php artisan migrate --force` against the Hostinger MySQL database; no destructive migration runs without a fresh backup first (`rules.md` §6).
4. **Storage link:** run `php artisan storage:link` so `storage/uploads` is publicly reachable (Section 3.3); confirm the `.htaccess` execution-deny (Section 3.7) is in place.
5. **Frontend build:** run `npm run build` locally/CI for both `/apps/storefront` and `/apps/admin`, producing static `dist/` bundles. **Confirmed:** storefront deploys at the domain root (`yoursite.com`); admin deploys to its own subdomain (`admin.yoursite.com`), each with its own document root/DNS A record on Hostinger.
6. **Web server config:** point `yoursite.com`'s document root at the storefront build; point `admin.yoursite.com`'s document root at the admin build; both consume the same Laravel API (recommend `api.yoursite.com` as its own subdomain routing to Laravel's `public/index.php`, keeping storefront/admin/API cleanly separated). Enable HTTPS (Hostinger free SSL, issued per subdomain) and force HTTPS redirects on all three.
7. **CORS:** configure Laravel CORS to allow only `yoursite.com` and `admin.yoursite.com` explicitly — not a wildcard, per `architecture.md`/`rules.md` security posture. Sanctum's stateful-domain config must list both, so cookie-based auth works correctly across the storefront/admin split.
8. **Queue/scheduler:** set up a Hostinger cron job to run `php artisan schedule:run` every minute (for notifications and any scheduled cleanup jobs) — shared/PHP hosting doesn't run a persistent worker process, so Laravel's cron-driven scheduler is the correct fit here rather than a long-running queue worker.
9. **Backups:** enable Hostinger's scheduled backup for both the MySQL database and the `storage/uploads/` directory (Section 3.6) from day one.
10. **Smoke test:** verify guest browsing, login/redirect-resume, checkout, booking creation, and every admin CRUD (products, categories, brands, banners, services, review showcase) end-to-end on the live domain before announcing go-live.

### 6.3 Environment separation
Maintain at minimum **local (development)** and **production** environments; a staging environment on a low-cost Hostinger subdomain is recommended if budget allows, so Phase 12 hardening/QA (per `phases.md`) can be verified somewhere other than the live production site.

## 7. Non-Functional Requirements
Inherits `PRD.md` §11 and `design.md` §4 in full (WCAG 2.2 AA, server-side authorization, responsive design, performance, auditability) — no changes; this SRS adds only the concrete hosting/performance notes in Sections 3.5 and 6.

## 8. Assumptions & Open Items Carried Forward
- ✅ Hostinger plan/tier confirmed — SSH + Composer + PHP 8.3 available (Section 6.1 resolved).
- ✅ Admin panel domain pattern confirmed — `admin.yoursite.com` subdomain (Section 6.2 resolved).
- ✅ Category hierarchy confirmed — parent/child subcategories required in V1 (`PRD.md` §12 item #14, `architecture.md` §4 updated accordingly).
- Remaining open item: refund/return policy exact wording (`PRD.md` §12 item #16) — content/legal only, does not block Phase 1–2 development.

---
**This document is the final technical anchor for implementation.** All five earlier documents remain valid; this SRS makes their abstract architecture concrete and Hostinger-deployable. Place at `/docs/SRS.md` alongside the existing five documents.
