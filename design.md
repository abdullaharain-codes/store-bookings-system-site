# design.md — UI/UX Design System
**Location in repo:** `/design.md` (repo root, alongside `PRD.md`, `SRS.md`, `architecture.md`, `rules.md`, `phases.md`, `frontend-plan.md`)
**Depends on:** `PRD.md`, `architecture.md`
**Target:** WCAG 2.2 AA · keyboard-first · original brand (not a Czone or TechHunk copy — see `00-PRODUCT-DEFINITION.md` §2 for the teardown this system is informed by)

---

## 1. Design Intent (one sentence)
A trustworthy, technical, premium Pakistani tech retailer where "Shop" and "Book a Service" are always presented as equally weighted, and every piece of merchandising content (brands, categories, banners, social proof) is admin-controlled and visibly fresh, never static.

## 2. Foundations & Design Tokens

> **TOKENS RECONCILED (2026-09-26):** the original restrained token set below was an early abstraction that was never cross-checked against the actual `design-reference/` prototype screens (40 screens, discovered/audited later in this project). Following a retroactive audit, colors/fonts/radius/shadows have been reconciled to match design-reference (see `packages/ui/src/styles/tokens.css` for current values) — WCAG AA contrast was re-verified for every new pairing before adoption. The tables below are updated in place to reflect current values; historical rationale for the original restrained approach is preserved in comments where it still applies (e.g. "no more than two shadow levels" remains a valid rule even though the shadow's exact rgba changed).

### 2.1 Typography
```
font.family.primary  = Inter, system-ui, sans-serif     (body, labels)
font.family.display  = Sora, Inter, system-ui, sans-serif  (headings, price-display)
font.size.xs   = 12px   font.size.sm  = 14px   font.size.md = 16px
font.size.lg   = 18px   font.size.xl  = 20px   font.size.2xl = 24px
font.size.3xl  = 32px   font.size.4xl = 48px
font.weight.regular = 400   font.weight.medium = 500   font.weight.semibold = 600   font.weight.bold = 700
font.lineHeight.base = 1.5
price-display: Sora 20px/24px bold 700   (product/service prices)
label-caps:    Inter 12px/16px semibold 600, letter-spacing 0.05em, uppercase   (eyebrows, badges, micro labels)
```
Two families, one scale, shared across storefront and admin — per `rules.md` §4, no per-page fonts. Sora is used for display/headlines/price only; Inter for everything else.

### 2.2 Color (semantic tokens — WCAG 2.2 AA verified pairings only)
> **RE-VERIFY PENDING (flagged 2026-09-30):** the `Badge` `success` variant renders `--color-status-success: #16A34A` as **text** on a 10%-tint background that is effectively near-white — roughly **3.3:1 at 12px**, which is **below the 4.5:1 body-text threshold** this section mandates. It slipped through the 2026-09-26 audit because the audit checked the status colours as *text on white*, not as they are actually paired in the component. No token change has been made; either darken the success token or give the `success` variant a darker text colour before the Badge is used on any customer-facing screen. Tracked as `phases.md` Phase 12 item 16.
```
color.text.primary      = #131B2E   (on light surfaces)
color.text.secondary    = #42474F   (on-surface-variant — readable on white AND tinted surfaces, ≥8:1)
color.text.muted        = #64748B   (text-muted — microcopy on white only, 4.76:1; do NOT use on tinted surfaces, drops to ~4.1:1)
color.text.inverse      = #F8FAFC   (on dark surfaces)
color.surface.base      = #FFFFFF
color.surface.muted     = #EAEDFF   (surface-container — blue-tinted, hover/placeholder/icon-tile bg)
color.surface.dark      = #0B1E36   (trust/technology anchor — HERO BACKDROP ONLY; see note below)
color.brand.accent      = #00355F   (canonical primary — nav, headings, prices, primary buttons; 12.55:1 with white)
color.accent.cta        = #C2410C   (high-intent CTA — "Book Service" orange; 5.18:1 with white)
color.status.success    = #16A34A
color.status.warning    = #B45309
color.status.error      = #DC2626
color.status.info       = #2563EB
color.border.default    = #E2E8F0
```
**`color.surface.dark` is not the header/footer anchor.** The reference screens
ship a **light** site chrome: the header is `surface-container-lowest` with a 1px
`border-b` in the outline colour, and the footer is `surface-dim` with a 1px
`border-t` (`homepage_with_featured_products_carousel/code.html` L177 and L954;
`laptops_category_apex_precision_tech_1/code.html` L136 repeats the light header,
adding only a `dark:` variant). In this repo's vocabulary that means the header
uses `color.surface.base` / `color.surface.muted` with `color.border.default`, and
the footer uses a dimmed surface with `color.border.default`. The dark token stays
available for hero backdrops and other dark media surfaces only. This also keeps
the shared `:focus-visible` ring (`color.brand.accent`) above 3:1 on the light bar
without introducing a second focus token.
Every text/surface pairing above must meet ≥4.5:1 contrast (body text) / ≥3:1 (large text, ≥24px or bold ≥19px) before use — this is the specific failure both reference sites had (see `00-PRODUCT-DEFINITION.md` §2) and must not be repeated. **Two deliberate AA deviations from the reference's exact hexes:** the reference high-intent CTA `#F97316` (2.80:1 with white — fails even 3:1) is darkened to `#C2410C`, and status-warning `#F59E0B` (2.15:1) to `#B45309`. `#F97316`/`#F59E0B` may only appear as large-graphic/decorative accents on tinted backgrounds, never as text or button fill with white text.

### 2.3 Spacing (8px base rhythm)
```
space.1=4px space.2=8px space.3=12px space.4=16px space.5=24px space.6=32px space.7=48px space.8=64px
```

### 2.4 Radius & Shadow (restrained — matches reference lg=4px xl=8px full=12px)
```
radius.sm=4px  radius.md=8px  radius.lg=12px   (cards use md, buttons use sm, pills/icon-circles use lg)
radius.full = 9999px   (pills, chips, icon-circles, avatar frames)
shadow.1    = 0px 1px 2px rgba(0,53,95,0.06)          (resting cards, dropdowns)
shadow.2    = 0px 8px 24px rgba(0,53,95,0.10)         (modals, popovers)
shadow.hover = 0px 12px 24px -4px rgba(0,53,95,0.04)  (card hover lift — ambient, primary-tinted)
```
No more than these three shadow levels anywhere (the original "no more than two" rule still holds — the third is the dedicated hover lift, not an extra resting level).

### 2.5 Motion
```
motion.duration.fast=150ms   motion.duration.base=250ms   motion.duration.slow=400ms
motion.easing.standard = cubic-bezier(0.2, 0, 0, 1)
```
Auto-sliding content (Homepage Hero Banner, Review Showcase) must respect `prefers-reduced-motion`: reduce/eliminate the automatic slide, keep manual controls fully functional.

---

## 3. Component Rules (anatomy, variants, states)

Every component below must define: **default, hover, focus-visible, active, disabled, loading, error** states, per `rules.md` §4 / the project's non-negotiable component contract.

### 3.1 Button
Variants: primary (accent fill — used once per view for the dominant action), secondary (outline), tertiary (text-only). Keyboard: fully operable via Tab/Enter/Space. Touch target ≥44×44px.

### 3.2 Product Card
Image, brand name (text, sourced from live Brand data), product name, price, strikethrough previous price if discounted, discount % badge, stock badge (In Stock/Out of Stock/Low Stock), rating, wishlist toggle (auth-gated — tapping as guest triggers redirect-and-resume per PRD §5.4), Add to Cart. Long product names truncate at 2 lines with ellipsis; never break card height.

### 3.3 Service Card
Name, short description, price **range** (min–max, never a single misleading number), duration, "Book Now" CTA.

### 3.4 Category Card *(new — Brand & Category Visual Management)*
**Anatomy:** logo/image (from `Category.logoImageId`), name, optional item count.
**Behavior:** entire card is a single click/tap target → navigates to `/shop/category/{slug}`. Image `alt` text = category name (required, not decorative).
**Data:** rendered purely from the `GET /categories?published=true` response — the component must accept zero hard-coded category props; if the API returns an empty published list the **Home band is omitted from the page** (Section 3.9), never rendered as an empty box.
**Card item markup:** each item is a **real link** to `/shop/category/{slug}` (a React Router `Link` wrapping the card), not a click-handler with a synthetic `href="#"` — so items are crawlable, shareable and middle-clickable. Image `alt` text = category name (required, not decorative). Card items must contain **no `id` attribute** (they are rendered twice inside a `Marquee`, and duplicate ids are invalid HTML).
**Home — "Shop by Category" band:** an `h2` (centered, per the design reference) + a horizontal band of Category Cards, in the API's order (admin `displayOrder`). The band is a **continuous `Marquee`** (Section 3.4/§3.5 band rules, §2.5 motion): one auto-scrolling row, hover/focus-paused, with the WCAG 2.2.2 pause/resume control. Below `MARQUEE_MIN_ITEMS = 6` items the same cards render instead as a **static, centred, wrapping row — no motion, no pause control**, because a marquee too short to overflow its container shows its duplicated loop copy mid-row and reads as a rendering fault. The page omits the whole section (heading included) when the published list is empty.
**Shop / category pages:** unchanged — horizontally scrollable row on mobile with visible partial-next-card affordance; grid on tablet/desktop. Do **not** apply the marquee outside Home; the band is a merchandising treatment for the Home page only.

### 3.5 Brand Card / Logo Tile *(new)*
**Anatomy:** logo image only (with `alt` = brand name), on a neutral card background so varied logo aspect ratios/colors stay visually consistent.
**Behavior:** clickable → `/shop/brand/{slug}`. Also reused, in compact form, as a **filter chip** on the Shop page filter panel — same data source, same click semantics (selecting = apply filter, not navigate, when used in filter context — document this variant distinction clearly in the component's prop API, e.g. `variant="tile" | "filter"`).
**Data:** from `GET /brands?published=true` — zero hard-coded brand list.
**Card item markup:** each item is a **real link** to `/shop/brand/{slug}` (React Router `Link` wrapping the tile). Items are rendered twice inside a `Marquee`, so — as with the Category Card — item markup carries **no `id` attribute** and no mount side effects.
**Home — "Shop by Brands" band:** mirrors §3.4 exactly: an `h2` (centered) + a band of Brand tiles in the API's order. Continuous `Marquee` at `>= MARQUEE_MIN_ITEMS (6)` brands; static, centred, wrapping row below that (no motion, no pause control); whole section omitted when no brand is published. Every published brand appears — brands are a flat list, so there is no top-level narrowing to apply (unlike §3.4).

### 3.6 Category Banner (category-page hero) *(new)*
Optional per category (`Category.bannerImageId`); when present, renders as a wide header image with the category name overlaid, at the top of that category's listing page. When absent, the category listing page renders without a banner slot (no broken-image placeholder) — component must handle the "no banner" case gracefully.

### 3.7 Homepage Hero Banner Carousel *(new)*
**Anatomy:** full-width image, optional overlay text/CTA, prev/next arrow controls, position-indicator dots.
**Behavior:**
- Auto-slides horizontally on an interval (default 6s — confirm with client, flagged as `PRD.md` §12 item #15).
- Desktop: pauses on mouse hover, resumes on pointer-leave.
- Touch: swipe left/right to navigate; auto-slide pauses during active touch/drag.
- Prev/Next controls always visible and keyboard-operable (Tab to control, Enter/Space to activate); dots are also keyboard-operable and announce current slide to screen readers (`aria-label="Slide 2 of 4"`).
- Loops continuously (last → first, first → last on reverse).
- Only `isPublished=true` banners render, in `displayOrder`.
- Click anywhere on the banner (except explicit prev/next controls) navigates to the **currently associated** category via `banner.targetCategory.slug` from the API payload — never a cached/stale URL.
- Reduced-motion: disables auto-slide, keeps manual controls.
**Empty state:** zero published banners → hero section is omitted entirely (page reflows), not shown as an empty carousel shell.

### 3.8 Review Showcase Carousel *(reuses the same generic Carousel primitive as 3.7, with a different content slot and lightbox enabled)*
**Anatomy:** review/social-proof screenshot images in a horizontally auto-scrolling strip.
**Behavior:** identical auto-scroll/hover-pause/swipe/loop rules as 3.7. Additionally: clicking/tapping an image opens a **lightbox modal** (Section 3.10) showing the enlarged image; only `isPublished=true` items render, in `displayOrder`.
**Distinction from Section 3.7:** different data source (`ReviewShowcaseItem`, not `HomepageBanner`), different click behavior (lightbox, not navigation), different placement (not the page-top hero). Do not let these two carousels visually or semantically merge — per `PRD.md` §6, this system must stay clearly separate from customer-submitted Reviews and from Hero Banners.

### 3.9 Empty / Loading / Error States (mandatory for every data-driven component)
- **Loading:** skeleton placeholders matching final layout shape — never a blank screen or generic spinner-only for list/grid content.
- **Empty:** a clear, friendly message + relevant action where applicable (e.g., "No products match these filters — Clear Filters"). Category/Brand/Banner sections with zero published items are omitted from the page rather than shown empty, per Sections 3.4/3.7.
- **Error:** user-safe message + retry action; never expose raw error/stack content (per `rules.md` §7).

### 3.10 Modal / Lightbox
Focus-trapped while open, closes on Esc and on overlay click, returns focus to the triggering element on close, `aria-modal="true"`, image `alt` text present.

### 3.11 Booking Stepper
Visual step indicator (e.g., 1–10 per the guided booking flow), current step highlighted, completed steps marked, back-navigation always available except after irreversible actions (final confirm submit). Must visibly preserve entered data when a user navigates back a step or is redirected through the auth resume flow (`PRD.md` §5.4/§12 item #12).

### 3.12 Status Badge
One consistent badge component reused for **order status, booking status, and stock status** — color mapped to the semantic status tokens (Section 2.2), never ad hoc colors per screen.

### 3.13 Admin Data Table
Sortable columns where relevant, pagination, row actions (edit/publish-toggle/delete with confirmation), bulk-select where useful (e.g., reordering categories/banners via drag handles, with a keyboard-accessible fallback reordering method — drag-only reordering fails keyboard-only admins).

---

## 4. Accessibility Acceptance Criteria (testable, pass/fail)

| Rule | Pass condition |
|---|---|
| Contrast | Every text/surface pairing in Section 2.2 measured ≥4.5:1 (body) / ≥3:1 (large text) |
| Keyboard operability | Every interactive element (including both carousels' controls, lightbox, filters) reachable and operable via Tab/Enter/Space alone, no mouse |
| Focus visibility | A visible focus ring/outline renders on every focused interactive element — never `outline: none` without a replacement indicator |
| Carousel accessibility | Auto-sliding content pauses on focus as well as hover/touch; reduced-motion respected; slide position announced to assistive tech |
| Image alt text | Every logo, banner, product image, and showcase image has meaningful `alt` text (brand/category name, or empty `alt=""` only for genuinely decorative duplicate images) |
| Form labels | Every input has a programmatically associated `<label>`, not placeholder-only labeling |
| Error messaging | Validation errors are associated with their field via `aria-describedby` and announced to screen readers |

---

## 5. Content & Tone Standards
Concise, confident, plain language — e.g., button labels are verbs ("Book Now," "Add to Cart," "Track Order"), never vague ("Click Here," "Submit"). Error messages explain what happened and what to do next (Section 3.9).

## 6. Anti-Patterns (prohibited)
- Hard-coded category/brand/banner content or images anywhere in frontend code (`architecture.md` §6).
- Two visually different carousels for Hero Banners vs. Review Showcase built as separate one-off implementations instead of the shared Carousel primitive (Sections 3.7/3.8).
- Auto-sliding content with no pause-on-hover/focus/touch mechanism.
- Low-contrast text, hidden focus indicators, placeholder-as-label forms.
- One-off spacing/typography/radius values outside the token scale.
- Product/category/brand cards overloaded with more metadata than Section 3.2–3.5 specify.

## 7. QA Checklist (per screen/component, before marking a phase complete)
- [ ] Matches token system (Section 2) — no one-off colors/spacing/fonts.
- [ ] All required states implemented (default/hover/focus/active/disabled/loading/error/empty).
- [ ] Keyboard-operable end to end.
- [ ] Contrast verified for all text/surface pairs used.
- [ ] Responsive verified at mobile/tablet/desktop breakpoints — not just a shrunk desktop layout.
- [ ] For any carousel: auto-scroll, hover-pause, focus-pause, touch-swipe, loop, reduced-motion, and (if applicable) lightbox all verified.
- [ ] For any brand/category/banner section: verified it renders purely from a live API call, and that publishing a new item in the admin panel makes it appear with no code change.
- [ ] No sensitive data or raw error detail exposed in any error/empty state.

---
**All five Phase-0 documents (`PRD.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`) are now complete and consistent with each other.** Repo placement (corrected 2026-09-30): the project root itself, not a `/docs/` folder — they ship as `/PRD.md`, `/architecture.md`, `/rules.md`, `/phases.md`, `/design.md`, alongside the later `/SRS.md` and `/frontend-plan.md`. There is no `/docs` directory in this repository.
