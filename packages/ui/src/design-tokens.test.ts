/**
 * Design-token guard (TASK B4-2a, item 0.2).
 *
 * Fails when any source file references `var(--some-token)` whose name is not
 * DEFINED in the token/theme CSS sources. Tailwind v4 compiles arbitrary
 * `var(--x)` utilities verbatim, so an invented name ships as a dead CSS
 * variable with no build error and no test failure — the component just
 * renders with the inherited value. This test is the net that catches it.
 *
 * Definitions are read from the two theme sources only:
 *   - packages/ui/src/styles/tokens.css  (the Tailwind v4 @theme)
 *   - apps/storefront/app/index.css      (the storefront's stylesheet root)
 * Defining a token anywhere else does NOT satisfy the guard on purpose —
 * a token that is not in the theme file is not part of the design system.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");

/** Files that DEFINE the design tokens (the theme sources). */
const TOKEN_SOURCE_FILES = [
  "packages/ui/src/styles/tokens.css",
  "apps/storefront/app/index.css",
];

/** Trees scanned for var(--…) usages. */
const SCANNED_TREES = ["packages/ui/src", "apps/storefront/app"];

/**
 * Genuinely dynamic names may be constructed at runtime and can never be
 * matched statically (e.g. a var() built from a prop). Add a name here ONLY
 * with a comment explaining the dynamic construction — never to silence a
 * typo. Empty by design: nothing in the codebase builds a token name today.
 */
const ALLOWED_DYNAMIC_NAMES: readonly string[] = [];

const TOKEN_DEFINITION_PATTERN = /--([a-z0-9-]+)\s*:/g;
const TOKEN_USAGE_PATTERN = /var\(\s*--([a-z0-9-]+)/g;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function isTestFile(path: string): boolean {
  return /\.test\.(ts|tsx)$/.test(path) || /\.spec\.(ts|tsx)$/.test(path);
}

function definedTokenNames(): Set<string> {
  const names = new Set<string>();
  for (const relativePath of TOKEN_SOURCE_FILES) {
    const content = readFileSync(join(repoRoot, relativePath), "utf8");
    for (const match of content.matchAll(TOKEN_DEFINITION_PATTERN)) {
      names.add(match[1]);
    }
  }
  return names;
}

describe("design-token guard", () => {
  it("every var(--token) used in ui/storefront sources is defined in the theme CSS", () => {
    const defined = definedTokenNames();
    const offenders: { name: string; file: string }[] = [];

    for (const tree of SCANNED_TREES) {
      const files = walkFiles(join(repoRoot, tree)).filter((file) => {
        if (isTestFile(file)) return false;
        return /\.(ts|tsx|css)$/.test(file);
      });

      for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const match of content.matchAll(TOKEN_USAGE_PATTERN)) {
          const name = match[1];
          if (defined.has(name)) continue;
          if (ALLOWED_DYNAMIC_NAMES.includes(name)) continue;
          offenders.push({
            name: `--${name}`,
            file: relative(repoRoot, file).replaceAll("\\", "/"),
          });
        }
      }
    }

    const report = offenders
      .map((offender) => `  ${offender.name}  (${offender.file})`)
      .join("\n");

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Undefined design tokens referenced via var(--name):\n${report}\n` +
          "Switch each to an existing token from packages/ui/src/styles/tokens.css — never invent one."
    ).toEqual([]);
  });
});
