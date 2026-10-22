import { describe, expect, it } from "vitest";
import type { RouteConfigEntry } from "@react-router/dev/routes";
import routes from "./routes";

/**
 * Reads the declarative route config as data. @react-router/dev/routes builds
 * a plain object graph, so asserting which surfaces sit behind the guard, or
 * which ones sit inside the site shell, needs no plugin, no typegen and no
 * build step.
 */
const GUARD_FILE = "routes/require-auth.tsx";
const SITE_LAYOUT_FILE = "routes/site-layout.tsx";

interface Placed {
  entry: RouteConfigEntry;
  /**
   * Fully resolved URL path, or null for a pathless layout. Pathless layouts
   * occupy no URL of their own, so they must stay out of path lookups —
   * otherwise the site layout would shadow "/" ahead of the home index.
   */
  path: string | null;
}

/** Joins a parent path with a child segment without doubling the slash. */
function resolve(base: string, segment: string): string {
  if (!segment) return base;
  return base === "/" ? `/${segment}` : `${base}/${segment}`;
}

/**
 * Computes the URL an entry occupies. Returns null for a pathless layout:
 * those occupy no URL of their own and must stay out of path lookups, or the
 * site layout would shadow "/" ahead of the home index.
 */
function pathOf(entry: RouteConfigEntry, base: string): string | null {
  const segment = typeof entry.path === "string" ? entry.path : "";
  if (!entry.index && segment === "") return null;
  return entry.index ? base : resolve(base, segment);
}

/**
 * Depth-first walk that resolves each entry's URL.
 *
 * Child routes inside a layout declare RELATIVE segments ("cart", not
 * "/cart"), so the absolute path has to be rebuilt as the tree is walked — a
 * top-level `entry.path === "/cart"` lookup silently stops matching the moment
 * a pathless layout is introduced.
 */
function flatten(): Placed[] {
  const placed: Placed[] = [];

  const walk = (list: RouteConfigEntry[], base: string) => {
    for (const entry of list) {
      const path = pathOf(entry, base);
      placed.push({ entry, path });
      if (entry.children) walk(entry.children, path ?? base);
    }
  };

  walk(routes as RouteConfigEntry[], "/");
  return placed;
}

/** Resolves a URL to its route entry, or throws so a typo fails loudly. */
function placedFor(path: string): Placed {
  const found = flatten().find(
    (candidate) => candidate.path !== null && candidate.path === path
  );
  if (!found) throw new Error(`route not found in config: ${path}`);
  return found;
}

function entryFor(path: string): RouteConfigEntry {
  return placedFor(path).entry;
}

/**
 * True when `path` sits under the file-backed layout `file`.
 *
 * Recursive rather than a flat scan: `inside` has to be scoped to the layout's
 * own subtree, otherwise everything declared after the require-auth layout
 * would look guarded, and every route after the site layout would look shelled.
 */
function isNestedUnder(path: string, file: string): boolean {
  const walk = (
    list: RouteConfigEntry[],
    base: string,
    inside: boolean
  ): boolean | null => {
    for (const entry of list) {
      const entryPath = pathOf(entry, base);
      const within = inside || entry.file === file;
      if (entryPath !== null && entryPath === path) return within;
      if (entry.children) {
        const child = walk(entry.children, entryPath ?? base, within);
        if (child !== null) return child;
      }
    }
    return null;
  };

  const result = walk(routes as RouteConfigEntry[], "/", false);
  if (result === null) throw new Error(`route not found in config: ${path}`);
  return result;
}

const isGuarded = (path: string) => isNestedUnder(path, GUARD_FILE);
const isInSiteShell = (path: string) => isNestedUnder(path, SITE_LAYOUT_FILE);

function findEntry(file: string): RouteConfigEntry {
  const found = flatten().find((candidate) => candidate.entry.file === file);
  if (!found) throw new Error(`${file} missing from the route config`);
  return found.entry;
}

describe("storefront route config", () => {
  it.each(["/cart", "/checkout", "/wishlist", "/account"])(
    "guards %s",
    (path) => {
      expect(isGuarded(path)).toBe(true);
    }
  );

  it.each(["/booking", "/login", "/shop"])("does not guard %s", (path) => {
    expect(isGuarded(path)).toBe(false);
  });

  it("guards the account index child as well", () => {
    const account = entryFor("/account");
    const accountIndex = account.children?.[0];

    expect(accountIndex?.index).toBe(true);
    expect(accountIndex?.file).toBe("routes/account._index.tsx");
    expect(isGuarded("/account")).toBe(true);
  });

  it("guards the order detail child and keeps it in the account tree", () => {
    const orderDetail = entryFor("/account/orders/:id");

    expect(orderDetail.file).toBe("routes/account.orders.$id.tsx");
    expect(isGuarded("/account/orders/:id")).toBe(true);
    expect(isInSiteShell("/account/orders/:id")).toBe(true);
  });

  it("declares require-auth as a pathless layout", () => {
    const guard = findEntry(GUARD_FILE);

    expect(guard.path).toBeUndefined();
    expect(guard.index).toBeUndefined();
    expect(guard.children?.length).toBe(4);
  });

  it("nests exactly the guarded surfaces under require-auth", () => {
    const guardPaths = (findEntry(GUARD_FILE).children ?? [])
      .map((child) => child.path)
      .filter((path): path is string => typeof path === "string");

    expect(guardPaths).toEqual(["cart", "checkout", "wishlist", "account"]);
  });

  it("keeps /register public", () => {
    expect(isGuarded("/register")).toBe(false);
  });
});

describe("storefront site shell", () => {
  it("declares the site layout as a pathless layout", () => {
    const shell = findEntry(SITE_LAYOUT_FILE);

    expect(shell.path).toBeUndefined();
    expect(shell.index).toBeUndefined();
  });

  it.each([
    "/",
    "/shop",
    "/services",
    "/booking",
    "/cart",
    "/checkout",
    "/wishlist",
    "/account",
  ])("wraps %s in the site shell", (path) => {
    expect(isInSiteShell(path)).toBe(true);
  });

  /**
   * The reference login and register screens carry no header, nav or footer, so
   * they are the documented exception to "wrap everything": they sit outside
   * the shell and keep their own <main>.
   */
  it.each(["/login", "/register"])("leaves %s chromeless", (path) => {
    expect(isInSiteShell(path)).toBe(false);
  });

  it("keeps the session guard nested inside the shell", () => {
    expect(isInSiteShell("/cart")).toBe(true);
    expect(isGuarded("/cart")).toBe(true);
  });
});
