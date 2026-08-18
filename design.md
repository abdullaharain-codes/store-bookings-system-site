# design.md — UI/UX Design System
**Location in repo:** `/docs/design.md`
**Depends on:** `PRD.md`, `architecture.md`
**Target:** WCAG 2.2 AA · keyboard-first · original brand (not a Czone or TechHunk copy — see `00-PRODUCT-DEFINITION.md` §2 for the teardown this system is informed by)

---

## 1. Design Intent (one sentence)
A trustworthy, technical, premium Pakistani tech retailer where "Shop" and "Book a Service" are always presented as equally weighted, and every piece of merchandising content (brands, categories, banners, social proof) is admin-controlled and visibly fresh, never static.

## 2. Foundations & Design Tokens

### 2.1 Typography
```
font.family.primary = Inter, system-ui, sans-serif
font.size.xs   = 12px   font.size.sm  = 13px   font.size.md = 14px
font.size.lg   = 16px   font.size.xl  = 18px   font.size.2xl = 22px
font.size.3xl  = 28px   font.size.4xl = 34px
font.weight.regular = 400   font.weight.medium = 500   font.weight.bold = 700
font.lineHeight.base = 1.5
```
One family, one scale, reused across storefront and admin — per `rules.md` §4, no page-specific fonts.

### 2.2 Color (semantic tokens — WCAG 2.2 AA verified pairings only)
```
color.text.primary      = #0F172A   (on light surfaces)
color.text.secondary    = #475569
color.text.inverse      = #F8FAFC   (on dark surfaces)
color.surface.base      = #FFFFFF
color.surface.muted     = #F1F5F9
color.surface.dark      = #0B1E36   (trust/technology anchor — header, footer, hero backdrop)
color.brand.accent      = #1D6FD6   (single primary-CTA accent — "Shop Now" / "Book Service")
color.status.success    = #16A34A
color.status.warning    = #D97706
color.status.error      = #DC2626
color.status.info       = #2563EB
color.border.default    = #E2E8F0
```
Every text/surface pairing above must meet ≥4.5:1 contrast (body text) / ≥3:1 (large text, ≥24px or bold ≥19px) before use — this is the specific failure both reference sites had (see `00-PRODUCT-DEFINITION.md` §2) and must not be repeated.

### 2.3 Spacing (8px base rhythm)
```
space.1=4px space.2=8px space.3=12px space.4=16px space.5=24px space.6=32px space.7=48px space.8=64px
```

### 2.4 Radius & Shadow (restrained — avoids both references' overuse)
```
radius.sm=6px  radius.md=10px  radius.lg=16px   (cards use md, buttons use sm, hero/banner containers use lg)
shadow.1 = 0px 2px 8px rgba(15,23,42,0.08)   (cards, dropdowns)
shadow.2 = 0px 8px 24px rgba(15,23,42,0.12)  (modals, popovers)
```
No more than these two shadow levels anywhere.

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
**Data:** rendered purely from the `GET /categories?published=true` response — the component must accept zero hard-coded category props; if the API returns an empty published list, render the Empty State (Section 3.9), never a blank grid.
**Responsive:** horizontally scrollable row on mobile with visible partial-next-card affordance; grid on tablet/desktop.

### 3.5 Brand Card / Logo Tile *(new)*
**Anatomy:** logo image only (with `alt` = brand name), on a neutral card background so varied logo aspect ratios/colors stay visually consistent.
**Behavior:** clickable → `/shop/brand/{slug}`. Also reused, in compact form, as a **filter chip** on the Shop page filter panel — same data source, same click semantics (selecting = apply filter, not navigate, when used in filter context — document this variant distinction clearly in the component's prop API, e.g. `variant="tile" | "filter"`).
**Data:** from `GET /brands?published=true` — zero hard-coded brand list.

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
**All five Phase-0 documents (`PRD.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`) are now complete and consistent with each other.** Recommended repo placement: project root `/docs/` folder, exactly as delivered.
