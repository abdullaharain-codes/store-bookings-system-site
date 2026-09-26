# frontend-plan.md — Frontend Build Plan (Storefront + Admin)
**Location in repo:** `/frontend-plan.md` (repo root, same convention as `PRD.md`/`SRS.md`/`architecture.md`)
**Depends on:** `design.md`, `architecture.md`, `rules.md`, `phases.md`, `PRD.md`, the `design-reference/` prototype set
**Status:** Plan — no frontend code is written yet. Docs-only until Step 0 is kicked off.
**Stack (verified):** Vite 8.2.0, React 19.2.8, react-router-dom 7.18.2, Tailwind v4 (`@tailwindcss/vite`), TanStack Query 5, Zustand 5, TS ~6.0, oxlint. npm workspaces (`apps/*`, `packages/*`). Node v24.18.0 / npm 11.16.0.

---

## Context from survey of current state
- `design-reference/` holds 40 screen prototypes (`code.html` + `screen.png`), the visual target. **Fully git-ignored today.**
- `design.md` §2 tokens already materialized in `packages/ui/src/styles/tokens.css` (Tailwind v4 syntax).
- `@ecommerce/ui` ships 6 of design.md's 13 components: `Button, Input, Card, Badge, Modal, Carousel`. **Missing:** ProductCard, ServiceCard, CategoryCard, BrandCard, Stepper, DataTable, Select/Textarea/Tabs, Empty/Loading/Error states, lightbox behavior, Category Banner.
- `@ecommerce/api-client` covers only catalog/cart/address/order/auth. **Missing:** services, bookings, availability, wishlist, review submission, notifications, profile, dashboard, home-page banners, review-showcase, whole `/admin/*` surface, asset upload.
- Both apps are Vite scaffolds with throwaway verification pages (`Home.tsx` "THROWAWAY", `FlowVerify.tsx`, stub `Login.tsx`); `dist/` builds exist; `QueryClientProvider` never wired; both `vite.config.ts` share default port 5173 (admin expected on 5174 by CORS).
- CORS/Sanctum already allow `localhost:5173` + `localhost:5174`.

### Hard constraints this plan must honor (from architecture.md / rules.md / design.md)
- Shared UI components live **only** in `packages/ui` — never duplicated in apps (rules.md §2).
- **Zero hard-coded taxonomy/brand/banner/promotional content** in frontend code (architecture.md §6) — every such section renders live API data; empty published lists → Empty State or omitted (design.md §3.4/§3.7).
- One generic **Carousel** primitive powers Homepage Hero Banner, Review Showcase, and lightbox (rules.md §4, design.md §3.7/§3.8).
- Frontend route guards are UX convenience only; every protected endpoint verifies auth server-side (PRD §5.5).
- Every data-driven component implements loading / empty / error rendering paths (rules.md §4, design.md §3.9).
- Semantic HTML + WCAG 2.2 AA + alt text per design.md §4; reduced-motion respected for auto-sliding carousels (design.md §2.5).
- Design tokens only — no one-off colors/spacing/radii (design.md §6); status colors only from the semantic status tokens via the shared Badge (design.md §3.12).

---

## Step 0 — Dev setup fixes (prereq, do first)
1. Add distinct ports: storefront `5173`, admin `5174` in `vite.config.ts` (`server.port`). Both currently unset → collision.
2. Add `VITE_API_URL` to per-app `.env` (default `http://localhost:8000/api/v1` already handled by api-client fallback); ensure root `.gitignore` covers `apps/*/.env` (currently only `server/.env` is ignored).
3. **Reconcile `@ecommerce/ui` peer deps** — ui declares `react ^18.3.0` peer/devDeps and `tailwindcss ^3.4.0` while apps run React 19 + Tailwind v4. Align ui peer/dev ranges to `^18.3.0 || ^19.0.0` (same pattern api-client already uses) and Tailwind to v4 so tokens/components work identically in both apps.
4. Wire `QueryClientProvider` into both `main.tsx` (TanStack Query is already a dep; server-state caching per architecture.md §9).
5. Confirm a fresh `npm install` at the root resolves workspace links cleanly after peer-dep changes (lockfile exists).

---

## Step 1 — Extend `@ecommerce/ui` (build the missing components; harden existing)
Existing to keep (extend, don't rewrite): `Button, Input, Card, Badge, Modal, Carousel`.

New components (each with default/hover/focus-visible/active/disabled/loading/error/empty states per design.md §3 preamble + rules.md §4):
1. **Carousel** — add lightbox-on-click optional prop (design.md §3.8), keyboard-operable dots (Tab/Enter/Space to activate), aria `Slide N of M` announcements (already present); auto-slide already respects hover/focus/touch/reduced-motion. Verify focus-pause.
2. **Modal** — add focus trap + return-focus-to-trigger on close (design.md §3.10; currently only Esc + overlay close + focus-on-open).
3. **EmptyState / LoadingSkeleton / ErrorState** (design.md §3.9) — skeleton matching final layout shape; friendly empty message + action; user-safe error + retry (no raw error text).
4. **ProductCard** (design.md §3.2) — live Brand name, price string→number parse, strikethrough+discount badge, stock badge (In/Low/Out), rating, auth-gated wishlist toggle, Add-to-Cart, 2-line ellipsis.
DECISION LOGGED: ProductCard's onViewDetails is currently a callback-only click handler (`<a href='#'>` + preventDefault), not a real crawlable href. Before wiring this into real storefront pages in Step 3 (SEO/prerendering requires real anchor hrefs to /product/{slug}), replace with a real href prop or a router-Link-compatible pattern. Not fixed now — presentational component only, no router dependency yet.
5. **ServiceCard** (design.md §3.3) — name, short description, price **range** (min–max), duration, "Book Now".
6. **CategoryCard** (design.md §3.4) — single click target → `/shop/category/{slug}`, alt = category name, empty→EmptyState.
7. **BrandCard** (design.md §3.5) — `variant="tile" | "filter"` distinction documented in prop API; alt = brand name.
8. **Stepper** (design.md §3.11) — current/completed/back-nav; data preserved across steps + resume.
9. **DataTable** (design.md §3.13) — sortable columns, pagination, row actions, bulk-select, keyboard-accessible reorder fallback.
10. **Select, Textarea, Tabs** — needed by admin forms + category pages (Phase 1 ui scope).
11. **Category Banner** (design.md §3.6) — renders wide header image when `Category.bannerImageId` present; omitted gracefully when absent.
Export all from `src/index.ts`; update ui `scripts.test` (see Testing Strategy).

---

## Step 2 — Extend `@ecommerce/api-client`
Add typed wrapper modules mirroring the Laravel controllers (response shapes copied from controllers, not guessed — same standard as existing `catalog.ts`/`cart.ts`):
1. `services.ts` — `GET /services`, `GET /services/{slug}`, `GET /services/{slug}/reviews` (+ availability/slot endpoints used by the booking wizard).
2. `bookings.ts` — `POST /bookings`, `GET /bookings`, `GET /bookings/{id}`, `POST /bookings/{id}/cancel`, reschedule endpoints.
3. `wishlist.ts` — `GET /wishlist`, `POST /wishlist/{productId}`.
4. `reviews.ts` — `POST /reviews` (product & service submission).
5. `notifications.ts` — `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
6. `profile.ts` — `GET /profile`, `PUT /profile`, `POST /profile/password`.
7. `dashboard.ts` — `GET /dashboard`.
8. `merchandising.ts` — `GET /homepage-banners` (payload includes resolved `targetCategory.slug`), `GET /review-showcase`.
9. `admin/*` — products, taxonomy (categories incl. `parent_category_id`, brands, publish/unpublish, reorder), services, orders, bookings (assign-technician, final-price, status), merchandising (banner + showcase CRUD/reorder/publish), settings (GET/GET-by-key/PATCH), `admin/assets` multipart upload (returns `Asset`).
10. Wire upload flow: `uploads` via `POST /admin/assets`, then reference returned `Asset.id`.
11. Update `index.ts` exports; `Image/Asset` URL helper if needed.
12. **Auth-store gap check:** role claim on `User` exists; add a client-side role-gate helper (UX-only) for admin routes.

---

## Step 3 — Storefront app
Route order mirrors already-completed backend phases (catalog → cart/checkout → account → booking → reviews/showcase/banners).
1. **Routes** (react-router v7, data-router): public + auth-gated wrapper (UX-only per PRD §5.5). Routes below are the canonical set (referenced by SEO Sitemap + meta config, §SEO).
   - Public: `/`, `/shop`, `/shop/category/:slug`, `/shop/brand/:slug`, `/product/:slug`, `/our-it-services`, `/service/:slug`, `/our-brands`, `/login`, `/register`.
   - Auth-gated: `/account/*` (dashboard, orders, order detail, bookings, booking detail, profile, addresses, wishlist, notifications), `/cart`, `/checkout`, booking wizard `/book/*` + `/booking/confirmed`.
2. **Layout** — header (dark `--color-surface-dark`, nav from live taxonomy), footer, built once, wraps all pages (matches `homepage_*` reference shell).
3. **Home (`/`)** — Hero banner **Carousel** (live `/homepage-banners`; omit section entirely when empty) → Shop by Category (live `/categories`, CategoryCard row) → featured products (live `/products`) → Shop by Brand (live `/brands`, BrandCard tiles) → Review Showcase **Carousel + lightbox** (live `/review-showcase`; omit when empty) → services teaser.
4. **Catalog** — `/shop` (live Taxonomy filter options, sort, search, pagination), `/shop/category/:slug` (subcategory scope handled via `CategoryService` on the API; Category Banner when present), `/shop/brand/:slug`, `/product/:slug` (gallery, qty, wishlist, Add-to-Cart auth-resume), search results.
5. **Cart/Checkout** — cart view, checkout w/ address management (`/addresses` list/create/default), Place Order (COD only), order confirmation.
6. **Account (`/account/*`)** — dashboard overview, orders + detail, bookings + detail, reschedule/cancel (2-hr cutoff), profile, addresses, wishlist, notifications — all backend-ready (Phases 9–11).
7. **Booking wizard** — multi-step (service → device → problem [+ optional photo] → date/time → address → confirm), Stepper, full step-data preservation + resume-after-login (PRD §5.4/§12 #12).
8. **Auth** — login/register; redirect-and-resume via existing `useRedirectAndResume`.
9. **Design matching** — every page mirrors its `design-reference/*/code.html` counterpart but is built from `@ecommerce/ui` components + tokens (the throwaway pages get deleted only after their covered flows are re-verified).

## Step 4 — Admin app
1. **Routes:** `/login`, `/` (dashboard), `/products`, `/categories`, `/brands`, `/services`, `/orders`, `/orders/:id`, `/bookings`, `/bookings/:id`, `/homepage-banners`, `/review-showcase`, `/settings`.
2. **Layout** — left side nav + top bar (matches `admin_dashboard_apex_precision_tech` reference).
3. **CRUD screens** via shared DataTable + Modal/drawer forms + Select/Textarea; image uploads via `POST /admin/assets`.
4. **Publish/unpublish + reorder** (categories, brands, banners, showcase) — keyboard-accessible reorder (design.md §3.13; ties to Phase 12 item #12).
5. **Bookings** — assign technician, final-price entry, status transitions (audit-logged server-side).
6. **Settings page** — GET/GET-by-key/PATCH, forms typed per BusinessSetting `type`.
7. Admin app is pure CSR (login-gated; no SEO need) — excluded from prerender set.

---

## SECTION: SEO Strategy

### Prerendering approach — compatibility survey (do the check before choosing)
Candidates evaluated against this project's **exact** versions: Vite **8.2.0**, React **19.2.8**, react-router-dom **7.18.2**, Node 24, npm workspaces.

| Candidate | Vite 8 | React 19 | Router v7 | Verdict |
|---|---|---|---|---|
| **React Router v7 native `prerender()` (Framework Mode)** — `@react-router/dev`, `react-router.config.ts` `prerender()` / `getStaticPaths` | ✅ (RR requires Vite 7+; we're on 8.2) | ✅ | ✅ (first-party — it's our installed router) | **✅ CHOSEN — first-party, zero third-party SSG package** |
| `vite-react-ssg` (Daydreamer-riri, latest 0.9.2) | ✅ (`^6.4 \|\| ^7.3 \|\| ^8.0`) | ✅ (`^17 \|\| ^18 \|\| ^19`) | ❌ **peer `react-router-dom ^6.14.1` only**; README explicitly says RR v7 users should use RR's built-in SSG | ❌ incompatible (RR v7) |
| `@mikhailsdv/vite-react-ssg` (fork addling RR v7) | ❌ **peer `vite ^2–^7` only**, no ^8 | ✅ | ✅ (`^7.0.0`) | ❌ incompatible (Vite 8) |
| `@wroud/vite-plugin-ssg` | ✅ (`^8`) | ✅ (`19+`) | ⚠️ "you own routing" / no router integration; RSC-oriented (@vitejs/plugin-rsc) | ⚠️ technically compatible, wrong shape for a plain SPA |
| `vite-plugin-react-ssg` (spa-prerender, unhead family) | ✅ (`^8.0.3`) | ✅ (`>=18.3.1`) | ✅ (`^6.4 \|\| ^7.0.0`, data-router + build-time `loader`) | ⚠️ viable fallback, less battle-tested |
| Hand-rolled prerender script (`createStaticHandler` + `renderToString` post-build) | ✅ (works on any Vite) | ✅ | ✅ (data-router) | ⚠️ viable fallback; bespoke engineering + hydration-matching risk |

**Survey conclusion / decision (verified by spike at `/spike-ssg-poc/`):** use **React Router v7 Framework Mode's native `prerender()`** in **SPA Mode (`ssr: false`) + prerender — NOT `ssr: true`**. Build with `ssr: false` emits static HTML + a `.data` file per prerendered route plus a single `__spa-fallback.html`, and **removes the server build entirely** — this is the only mode consistent with SRS §2.2's "static SPA bundles" model. `ssr: true` was built and verified **rejected**: in Framework Mode the client router calls a runtime `/__manifest` endpoint that requires a Node server, which violates the static-hosting constraint. The spike confirmed via a real headless-Chrome pass: all four probe routes (`` `/` `` + three `/product/:slug`) serve `200` with crawlable SSR'd content from a plain static file server (no Node runtime), hydrate with **zero console/page errors**, and client-side SPA navigation between prerendered pages resolves through the emitted `.data` files. `getStaticPaths`-style expansion is done by returning the expanded path list from the `prerender()` function in `react-router.config.ts` (`["/", ...STATIC_SLUGS]`). This is the only approach built *for* our installed router version (spike used `@react-router/dev` 7.18.4 + Vite 8.3.1), needs no third-party SSG package, and its dynamic-slug prerender covers `/product/:slug`, `/shop/category/:slug`, `/shop/brand/:slug`, `/service/:slug` sourced from the API at build time. Web evidence: `vite-react-ssg`'s own README defers RR-v7 users to RR's built-in SSG; RR v7 changelog + community write-ups confirm static `build/client/` + `.data` + `__spa-fallback.html` output deployed to a plain CDN/static host.

**Implementation gotchas (from spike):**
- **(a) `react-router typegen` must run before build.** RR's `+types` virtual modules do not resolve until the typegen step has generated `.react-router/types/`. Add `"typegen": "react-router typegen"` (or run it inside the `prebuild`/`pretest` script / CI step) and require `typescript` as a devDependency. The spike's first build failed with `[UNRESOLVED_IMPORT] Could not resolve './+types/product.$slug'` until typegen ran.
- **(b) Route type imports must use `import type { Route } from "./+types/..."`, NOT `import { type Route }`.** The inline form fails to resolve at build under Vite 8/rolldown — known RR issue remix-run/react-router#12503. Linters/autofixers that emit the inline form will produce a broken build; enforce the verbatim `import type` style in the route files.
- **(c) Non-prerendered/new slugs need a `clientLoader` + `HydrateFallback` per route.** A deep-link to a slug not in the prerender set loads the SPA fallback shell; without a `clientLoader` it renders a console-erroring "Application Error" shell. In the spike, adding `clientLoader` (with `clientLoader.hydrate = true`) + a `HydrateFallback` made the same deep-link render a clean runtime 404 through the loader. This is the concrete mechanism behind the "Staleness guard" below — cross-reference it when implementing Step 3; a real `clientLoader` re-fetches product data from the API for slugs created after deploy.
- Spike is preserved at **`/spike-ssg-poc/`** at the repo root (not gitignored) for reference during Step 3 implementation — it contains the complete working example (`react-router.config.ts`, root/route modules, plain static server `serve-static.mjs`, and headless-Chrome checks `hydration-check.mjs` / `spa-nav-check.mjs`).

**Framework Mode migration cost (flagged honestly):** RR Framework Mode is a different app shell vs. the current declarative `<BrowserRouter><Routes>` (needs `routes.ts`, `root.tsx`, `@react-router/dev`, `entry.client.tsx`). Mitigate by adopting Framework Mode during Step 3 route scaffolding in **storefront only** (admin stays plain CSR). If the migration proves disruptive mid-build, the documented fallback is `vite-plugin-react-ssg` (keeps existing Vite SPA shape, executes route `loader`s at build).

**Prerender set (public storefront routes ONLY; build-time static HTML, no runtime server):**
- `/`, `/shop`, `/our-it-services`, `/our-brands`
- Dynamic via `getStaticPaths()` from the live API at build: `/shop/category/:slug`, `/shop/brand/:slug`, `/product/:slug`, `/service/:slug`
- **Always pure CSR, never prerendered:** `/account/*`, `/cart`, `/checkout`, `/login`, `/register`, booking wizard (auth-gated; no SEO value; avoids baking session data).

**Staleness guard (important — honors architecture.md §6):** prerendered slug pages carry build-time loader data. Post-deploy data freshness is preserved with React Router's **`clientLoader` revalidation** (`HydrateFallback` pattern; concrete mechanism verified in spike gotcha (c) above): the static HTML ships the SEO-relevant shell/content, then the client re-fetches categories/brands/banners/products via TanStack Query so publishing a banner/category/brand still appears immediately post-hydration (no redeploy). New dynamically-created products/categories appear for crawlers on the next build/deploy — accepted and documented.

### Per-route `<title>` and meta description
- Use **React 19 native metadata hoisting** (render `<title>`/`<meta>` anywhere, React moves them to `<head>`) + implement a tiny `SeoHead`/`Meta` wrapper util per route. This replaces `react-helmet-async`, which is stale (unmaintained; latest majors predate React 19 and are unvetted against it) — a survey note, not an assumption. (If RR Framework Mode provides `Meta`/`Links` route-module exports in the final version we land on, prefer those over a custom util.)
- Every prerendered route sets: unique `<title>`, `<meta name="description">`, canonical URL, and `og:title`/`og:description` for listing/detail pages (og:image from a `ProductImage`/banner asset where available).

### `sitemap.xml` + `robots.txt` as a build step
- Generate **`sitemap.xml`** in the prerender/build step from the same route list + `getStaticPaths` output (public routes only; base URL from `VITE_APP_URL`/deployment config; optionally add `<lastmod>` from updated_at). Unknown dynamic routes happen at next build — consistent with the staleness policy above.
- Generate **`robots.txt`**: allow public routes; `Disallow: /account`, `/admin`, `/cart`, `/checkout`.
- Implement as a small Node script wired into the storefront `build` script (post-prerender emit), so a standard static file drop (CDN / Hostinger `public_html`) serves both.

### Semantic HTML requirement (carried into every component)
- Proper heading hierarchy (single `h1` per page; sections `h2`…), landmark elements (`header`/`nav`/`main`/`footer`), meaningful alt text per design.md §4 for every logo/banner/product/showcase image (or `alt=""` only for genuinely decorative duplicates), focus visibility retained, skip-link on public shell. Enforced per component build (design.md §7 QA checklist), not retrofitted at the end.

---

## SECTION: Testing Strategy

### Level 1 — Unit tests: Vitest + React Testing Library
- Scope: **every** `packages/ui` component and **every** `packages/api-client` module.
- Add to workspace deps once: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` (or `happy-dom`). Add a `test` script to ui + api-client packages and a shared `vitest.workspace.ts`/config at repo root.
- **Written alongside each component/module as it's built (same task, not batched at the end).** Example coverage per ui component: renders each variant/all states (default/hover/focus/active/disabled/loading/error/empty), a11y attributes (`aria-`), keyboard operability (Button enter/space, Modal focus trap + Esc + return-focus, Carousel dots/prev/next Tab+Enter), reduced-motion behavior, and "no hard-coded data" (components take data via props only). Per api-client module: request URL/path, params, auth header (XSRF interceptor), response envelope→type mapping, and error propagation — against a mocked `apiClient` (no live server).
- Reconcile the existing `packages/api-client/src/stores/pending-action-store.test.mjs` (plain MJS test) into the new Vitest harness during Step 2 so all tests run under one runner.

### Level 2 — Integration tests: MSW (Mock Service Worker)
- Add `msw` as a devDep in both apps. Mock the `/api/v1/*` surface per test (fixtures typed from `@ecommerce/api-client` types + the survey's verified response shapes).
- **Page-level flow tests** (storefront): browse home → hero/categories/brands/showcase render from mocked `published` payloads; empty payload → sections omitted / Empty States shown; shop search/filter/sort/pagination; product detail → Add to Cart as guest → login resume → cart contains item (redirect-and-resume end-to-end against mocked API); checkout → place order → confirmation. **Admin:** login gate, product CRUD list→create→edit→publish toggle reflected in list, banner reorder.
- Loading (skeleton) + error (retry) paths asserted for every data-driven page in these tests.

### Level 3 — Real e2e (Playwright)
- **Explicitly DEFERRED to Phase 12 (Hardening).** Documented here so it is not built now: no Playwright setup or tests in Phase 13 frontend work. Phase 12 adds browser-level e2e (full booking flow, checkout, keyboard-only traversal, both carousels, lightbox, reduced-motion) as part of its accessibility/responsive QA gate.

### Task discipline (mirroring the backend quality gate)
- Every scoped frontend task follows the backend's **PLAN → SMALL IMPLEMENTATION → TEST → VERIFY** discipline: the task includes its own unit/integration tests in the same change; a task is not "done" until `npm run lint` (oxlint), `npm run build` (tsc -b + vite), and the relevant Vitest suite pass in the affected packages/apps.

---

## Step 5 — Verification gates (design.md §7 + rules.md, applied to every screen/component)
- Matches token system (§2) — no one-off colors/spacing/fonts/radii.
- All required states present (default/hover/focus/active/disabled/loading/error/empty).
- Keyboard-operable end-to-end; contrast verified per §4 criteria.
- Responsive at mobile/tablet/desktop breakpoints (not shrunk desktop).
- Carousels: auto-scroll, hover-pause, focus-pause, touch-swipe, loop, reduced-motion, lightbox — verified for **both** Hero and Showcase.
- Brand/category/banner sections verified to render purely from live API: publishing in admin appears with no code change (post-hydration revalidation).
- No sensitive data or raw error detail in any error/empty state.
- `npm run lint` + `npm run build` green in both apps and both packages; Vitest suites green.
- No regression in previously verified flows (the throwaway `Home.tsx`/`FlowVerify.tsx` flows are re-verified page-for-page before those files are deleted).

---

## Open items surfaced during planning (decisions to confirm before/while building)
1. **Framework Mode migration scope** — adopt RR Framework Mode in storefront (recommended for SEO) vs. stay declarative + fallback plugin. (Storefront-only; admin unaffected.)
2. **Staleness policy accepted?** New products/categories created between deploys render for crawlers only on the next build; client revalidation keeps live visitors fresh. (Recommended: accept.)
3. **`@ecommerce/ui` React/Tailwind peer alignment** (React 19 + TW v4) — recommended, unblocks React 19 coinstallation today.
4. **Port assignment** (storefront 5173 / admin 5174) matches pre-configured CORS/Sanctum defaults — recommended, no backend change needed.