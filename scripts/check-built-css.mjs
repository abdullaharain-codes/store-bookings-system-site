// Guard: assert that packages/ui's own Tailwind classes reach a built app CSS.
// Tailwind v4 scans the consuming app's Vite root, so packages/ui needs an
// explicit `@source` (see packages/ui/src/styles/index.css). If that directive
// regresses, ui components silently ship unstyled -- no build error, no test
// failure. This script is the only automated signal for that class of bug.
//
// Usage (from the repo root, after an app build):
//   node scripts/check-built-css.mjs apps/storefront/build/client/assets/root-XXXX.css
//   node scripts/check-built-css.mjs apps/admin/dist/assets/index-XXXX.css
//
// Dependency-free on purpose: no imports beyond node: builtins.
// Exits 1 and lists every missing selector. Not wired into CI (none exists).

import { readFileSync } from "node:fs";

const REQUIRED = [
  "h-24", // BrandCard logo box
  "w-24", // BrandCard logo box
  "object-contain", // BrandCard logo
  "h-11", // Marquee pause button
  "w-11", // Marquee pause button
  "w-max", // Marquee track
  "justify-around", // Marquee copy
  "min-h-[44px]", // Button tap target (arbitrary)
  "pr-[var(--space-6)]", // Marquee copy trailing spacing (arbitrary)
];

// Tailwind writes class selectors with punctuation backslash-escaped. These are
// literal backslashes in the CSS text, not regex syntax.
function escapeClass(name) {
  return "." + name.replace(/([\[\]()%,.:/])/g, "\\$1").replace(/ /g, "\\ ");
}

// Substring search plus a boundary check, so `.h-24` cannot match `.h-240`.
function isPresent(css, selector) {
  for (let from = 0; ; ) {
    const at = css.indexOf(selector, from);
    if (at < 0) return false;
    const next = css[at + selector.length];
    if (next === undefined || !/[\w\\-]/.test(next)) return true;
    from = at + 1;
  }
}

const cssPath = process.argv[2];
if (!cssPath) {
  console.error("usage: node scripts/check-built-css.mjs <built-app.css>");
  process.exit(2);
}

let css;
try {
  css = readFileSync(cssPath, "utf8");
} catch {
  console.error(`check-built-css: cannot read ${cssPath} (build the app first)`);
  process.exit(2);
}

const missing = REQUIRED.filter((c) => !isPresent(css, escapeClass(c)));

if (missing.length > 0) {
  console.error(`check-built-css: FAIL ${cssPath}`);
  console.error(`  ${missing.length}/${REQUIRED.length} packages/ui classes missing:`);
  for (const c of missing) console.error(`    .${c}`);
  console.error("  Cause: packages/ui is outside the app's Tailwind scan base.");
  console.error("  Check the @source lines in packages/ui/src/styles/index.css.");
  process.exit(1);
}

console.log(`check-built-css: PASS ${cssPath} (${REQUIRED.length}/${REQUIRED.length})`);