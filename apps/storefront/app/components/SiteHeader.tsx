import { useAuthStore } from "@ecommerce/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { siteConfig } from "../config/site";
import { useCartCount } from "../hooks/useCartCount";
import { useNavBrands } from "../hooks/useNavBrands";
import { type NavCategory, useNavCategories } from "../hooks/useNavCategories";
import { queryKeys } from "../hooks/query-keys";
import {
  CartIcon,
  ChevronDownIcon,
  CloseIcon,
  HeartIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "./icons";

/**
 * Site header.
 *
 * Surface follows the reference prototypes (a light bar with a 1px bottom
 * border, primary-blue wordmark), not `design.md`'s original claim that
 * `--color-surface-dark` is the header anchor — no reference screen actually
 * uses it. Staying light also keeps the shared `:focus-visible` ring
 * (`--color-brand-accent`) above 3:1, so no extra token is needed.
 *
 * The promo strip is NOT rendered here. It lives in the layout directly above
 * this component, because `position: sticky` only travels inside its parent's
 * box: a sticky bar wrapped in a header-sized element is pinned for roughly its
 * own height and then scrolls away with the announcement.
 *
 * Category and brand entries are rendered from the API, never hard-coded, and
 * the menu toggles disappear when the taxonomy is empty or unreachable. The
 * static Shop / Services links are always present, so navigation still works
 * during a prerender pass when no request has been made yet.
 */

const SEARCH_PLACEHOLDER = "Search products or services...";
const CATEGORY_BASE = "/shop/category";
const BRAND_BASE = "/shop/brand";

/** Round icon affordance: a glyph only, so the hit target can stay compact. */
const iconButtonClass =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-accent)] transition-colors hover:bg-[var(--color-surface-muted)]";

/** Word-shaped affordance ("Log in", "Log out"): padded, so it needs no glyph. */
const textLinkClass =
  "inline-flex items-center rounded-[var(--radius-sm)] px-3 py-2 text-[length:var(--font-size-sm)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-brand-accent)]";

const iconSize = "h-5 w-5";
const navLinkClass =
  "text-[length:var(--font-size-md)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-accent)]";
const menuItemClass =
  "block rounded-[var(--radius-sm)] px-3 py-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-brand-accent)]";

/**
 * Recursive list items. Renders <li> elements only, so its caller can supply
 * the one <ul> — nesting a <ul> inside a <ul> is invalid and browsers drop the
 * inner list entirely.
 */
function CategoryItems({
  categories,
  basePath,
  onNavigate,
  linkClassName,
}: {
  categories: NavCategory[];
  basePath: string;
  onNavigate?: () => void;
  linkClassName?: string;
}) {
  return (
    <>
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            to={`${basePath}/${category.slug}`}
            onClick={onNavigate}
            className={linkClassName ?? menuItemClass}
          >
            {category.name}
          </Link>
          {category.children.length > 0 && (
            <ul className="border-s-2 border-[var(--color-border-default)] ps-3">
              <CategoryItems
                categories={category.children}
                basePath={basePath}
                onNavigate={onNavigate}
                linkClassName={linkClassName}
              />
            </ul>
          )}
        </li>
      ))}
    </>
  );
}

function CategoryList({
  categories,
  basePath,
  onNavigate,
  className,
  linkClassName,
}: {
  categories: NavCategory[];
  basePath: string;
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <ul className={className}>
      <CategoryItems
        categories={categories}
        basePath={basePath}
        onNavigate={onNavigate}
        linkClassName={linkClassName}
      />
    </ul>
  );
}

function BrandList({
  brands,
  basePath,
  onNavigate,
  className,
  linkClassName,
}: {
  brands: { id: number; name: string; slug: string }[];
  basePath: string;
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <ul className={className}>
      {brands.map((brand) => (
        <li key={brand.id}>
          <Link
            to={`${basePath}/${brand.slug}`}
            onClick={onNavigate}
            className={linkClassName ?? menuItemClass}
          >
            {brand.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Click-to-open disclosure, controlled by the parent so only one panel in the
 * header can be open at a time. No hover behaviour, so the panel is reachable
 * by keyboard.
 *
 * Dismissal covers the four ways a user actually leaves: Escape (focus returns
 * to the toggle), a pointer press outside, focus moving outside, and the parent
 * closing it because another panel opened or the route changed.
 */
function Dropdown({
  label,
  isOpen,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;

    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && container?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      // Send focus back where it came from, or Escape strands the user.
      toggleRef.current?.focus();
    };
    // Native listener rather than React's onFocusOut: synthetic focusout does
    // not surface reliably for programmatic focus moves (keyboard tabbing),
    // which is exactly the case this has to handle.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      // relatedTarget is null when focus leaves the document entirely, which
      // is also a dismissal.
      if (next instanceof Node && container?.contains(next)) return;
      onClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    container?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      container?.removeEventListener("focusout", onFocusOut);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className={navLinkClass}
      >
        {label}
        <ChevronDownIcon
          className={`ms-1 inline-block h-4 w-4 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute start-0 z-50 mt-2 w-64 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-2 shadow-[var(--shadow-2)]"
        >
          {children(onClose)}
        </div>
      )}
    </div>
  );
}

function SearchForm({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = term.trim();
    // An empty box must not push a bare `?search=` onto the listing.
    if (!trimmed) return;
    const params = new URLSearchParams({ search: trimmed });
    navigate(`/shop?${params.toString()}`);
  }

  return (
    <form role="search" onSubmit={onSubmit} className={className}>
      <label htmlFor="site-search" className="sr-only">
        Search products and services
      </label>
      <div className="relative">
        <input
          id="site-search"
          type="search"
          name="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
          className="w-full rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-muted)] py-2 ps-4 pe-11 text-[length:var(--font-size-sm)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-brand-accent)] focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute end-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-brand-accent)] hover:bg-[var(--color-surface-base)]"
        >
          <SearchIcon className={iconSize} />
        </button>
      </div>
    </form>
  );
}

function CartLink({ className }: { className?: string }) {
  const { count } = useCartCount();

  // The count lives in the accessible name, so the badge itself is hidden from
  // assistive tech and never announced twice. "0 items" is noise, so an empty
  // cart keeps the plain name and renders no badge.
  const label =
    count === null || count === 0
      ? "Cart"
      : `Cart, ${count} ${count === 1 ? "item" : "items"}`;

  return (
    <Link to="/cart" aria-label={label} className={className ?? iconButtonClass}>
      <CartIcon className={iconSize} />
      {count !== null && count > 0 && (
        <span
          aria-hidden="true"
          data-testid="cart-count"
          className="absolute -end-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-brand-accent)] px-1 text-xs font-semibold text-[var(--color-surface-base)]"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/**
 * Guest sees a log in link, a signed-in visitor sees account + log out, and an
 * unresolved session renders neither — a flashing "Log in" would tell a
 * signed-in visitor they are signed out.
 */
function AuthActions() {
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isSessionChecked) return null;

  if (!isAuthenticated) {
    return (
      <Link to="/login" className={textLinkClass}>
        Log in
      </Link>
    );
  }

  async function onSignOut() {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      // Drop the previous user's per-user caches before anything can re-render
      // them, even if the logout call itself failed.
      queryClient.removeQueries({ queryKey: queryKeys.cart });
      queryClient.removeQueries({ queryKey: queryKeys.wishlist });
      setIsSigningOut(false);
      navigate("/");
    }
  }

  return (
    <>
      <Link to="/account" aria-label="Account" className={iconButtonClass}>
        <UserIcon className={iconSize} />
      </Link>
      <button
        type="button"
        onClick={onSignOut}
        disabled={isSigningOut}
        className={`${textLinkClass} disabled:opacity-60`}
      >
        Log out
      </button>
    </>
  );
}

/**
 * Promotional strip rendered by the site layout, directly above the header.
 * Scrolling takes it away and leaves the header bar pinned.
 */
export function SiteAnnouncement() {
  if (!siteConfig.announcement) return null;

  return (
    <p
      data-testid="site-announcement"
      className="bg-[var(--color-brand-accent)] px-4 py-2 text-center text-[length:var(--font-size-sm)] text-[var(--color-text-inverse)]"
    >
      {siteConfig.announcement}
    </p>
  );
}

const MOBILE_MENU = "mobile";
const CATEGORIES_MENU = "categories";
const BRANDS_MENU = "brands";

export function SiteHeader() {
  const { categories } = useNavCategories();
  const { brands } = useNavBrands();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /**
   * One open panel for the whole header, recorded against the route it was
   * opened on. Deriving "is open" during render means opening Brands closes
   * Categories for free, and a navigation closes everything, with no effect
   * that has to setState on the way out.
   */
  const routeKey = `${location.pathname}${location.search}`;
  const [openPanel, setOpenPanel] = useState<{
    id: string;
    routeKey: string;
  } | null>(null);
  const openId = openPanel?.routeKey === routeKey ? openPanel.id : null;

  // Stable identity, so the Dropdown effect below does not tear down and
  // re-register its document listeners on every header render.
  const closeAll = useCallback(() => setOpenPanel(null), []);
  const toggle = (id: string) =>
    setOpenPanel((current) =>
      current?.id === id && current.routeKey === routeKey ? null : { id, routeKey }
    );

  useEffect(() => {
    if (openId !== MOBILE_MENU) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeAll();
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, closeAll]);

  return (
    <header
      aria-label="Site header"
      // Sticky needs a parent taller than this element; the layout root is the
      // only such ancestor, so the class has to sit here and not on an inner
      // wrapper.
      className="sticky top-0 z-50 border-b border-[var(--color-border-default)] bg-[var(--color-surface-base)]"
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
        <Link
          to="/"
          className="font-[family-name:var(--font-family-display)] text-[length:var(--font-size-xl)] font-bold tracking-tight text-[var(--color-brand-accent)]"
        >
          {siteConfig.name}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          <Link to="/shop" className={navLinkClass}>
            Shop
          </Link>
          <Link to="/services" className={navLinkClass}>
            Services
          </Link>
          {categories.length > 0 && (
            <Dropdown
              label="Categories"
              isOpen={openId === CATEGORIES_MENU}
              onToggle={() => toggle(CATEGORIES_MENU)}
              onClose={closeAll}
            >
              {(close) => (
                <CategoryList
                  categories={categories}
                  basePath={CATEGORY_BASE}
                  onNavigate={close}
                />
              )}
            </Dropdown>
          )}
          {brands.length > 0 && (
            <Dropdown
              label="Brands"
              isOpen={openId === BRANDS_MENU}
              onToggle={() => toggle(BRANDS_MENU)}
              onClose={closeAll}
            >
              {(close) => (
                <BrandList
                  brands={brands}
                  basePath={BRAND_BASE}
                  onNavigate={close}
                />
              )}
            </Dropdown>
          )}
        </nav>

        <SearchForm className="order-last w-full md:order-none md:ms-auto md:w-72" />

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <CartLink />
          <Link to="/wishlist" aria-label="Wishlist" className={iconButtonClass}>
            <HeartIcon className={iconSize} />
          </Link>
          <span className="hidden items-center gap-2 md:flex">
            <AuthActions />
          </span>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={openId === MOBILE_MENU ? "Close menu" : "Open menu"}
            aria-expanded={openId === MOBILE_MENU}
            aria-controls={panelId}
            onClick={() => toggle(MOBILE_MENU)}
            className={`${iconButtonClass} md:hidden`}
          >
            {openId === MOBILE_MENU ? (
              <CloseIcon className={iconSize} />
            ) : (
              <MenuIcon className={iconSize} />
            )}
          </button>
        </div>
      </div>

      {openId === MOBILE_MENU && (
        <nav
          id={panelId}
          aria-label="Mobile"
          className="border-t border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-4 py-4 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            <li>
              <Link
                to="/shop"
                onClick={closeAll}
                className="block rounded-[var(--radius-sm)] py-2"
              >
                Shop
              </Link>
            </li>
            <li>
              <Link
                to="/services"
                onClick={closeAll}
                className="block rounded-[var(--radius-sm)] py-2"
              >
                Services
              </Link>
            </li>
            {categories.length > 0 && (
              <li>
                <CategoryList
                  categories={categories}
                  basePath={CATEGORY_BASE}
                  onNavigate={closeAll}
                  linkClassName="block rounded-[var(--radius-sm)] py-2"
                />
              </li>
            )}
            {brands.length > 0 && (
              <li>
                <BrandList
                  brands={brands}
                  basePath={BRAND_BASE}
                  onNavigate={closeAll}
                  linkClassName="block rounded-[var(--radius-sm)] py-2"
                />
              </li>
            )}
            <li className="mt-2 flex items-center gap-3 border-t border-[var(--color-border-default)] pt-3">
              <CartLink />
              <Link
                to="/wishlist"
                onClick={closeAll}
                aria-label="Wishlist"
                className={iconButtonClass}
              >
                <HeartIcon className={iconSize} />
              </Link>
              <AuthActions />
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
