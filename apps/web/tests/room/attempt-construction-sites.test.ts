// **Ruling R17, as something other than a promise** — wave 7F4b's review, finding F6.
//
// R17 is *"the design is written once per composition, by one attempt the run owns"*, and the whole
// of it rests on **where `createDesignCreationAttempt` is called**. The factory's own doc comment
// states the consequence of getting it wrong — *"constructing one inside a click handler mints a
// row, and navigates, per tap"* — and until this file nothing was red if a second call site
// appeared: each attempt satisfies 7E2's one-row-per-attempt guarantee on its own, so a screen that
// built two would write two rows with every existing test green.
//
// `room-handoff.dom.test.ts` counts `POST /api/designs` through the rendered screen, which catches a
// second attempt **on the path it drives**. This catches one anywhere, including in a file that has
// no test yet. It is the structural claim `qa-7f1-copy-and-conversions.adversarial.test.ts` makes
// about `src/room`'s text, in the same shape and for the same reason.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

/** The factory being called, rather than being declared or imported. `export function` is excluded
 *  by the lookbehind; an `import { … }` line carries no parenthesis and never matches.
 *
 *  Prose that spells the name **with** a parenthesis would match. That is a false positive this
 *  file prefers to the alternative: a matcher that tried to strip comments would be a second parser
 *  to get wrong, and a wrong failure here is read once and fixed. */
function callSitesIn(source: string): number {
  return [...source.matchAll(/(?<!function )createDesignCreationAttempt\s*\(/g)]
    .length;
}

function declarationsIn(source: string): number {
  return [...source.matchAll(/function createDesignCreationAttempt\s*\(/g)]
    .length;
}

function sourceFilesUnder(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The files under `apps/web/src` in which `count` finds something, named as the repository names
 *  them. Files rather than a number, so a failure says **where** the second one is. */
function filesWhere(count: (source: string) => number): readonly string[] {
  return sourceFilesUnder(SOURCE_ROOT).flatMap((path) => {
    const found = count(readFileSync(path, "utf8"));
    return Array.from({ length: found }, () => relative(SOURCE_ROOT, path));
  });
}

describe("one attempt is constructed in one place (ruling R17)", () => {
  it("is called from exactly one module under apps/web/src", () => {
    // `use-generation.ts` calls it in `attemptFor`, from the transition in which a design first
    // exists. A second entry here is a second mint identity, and therefore a second row per
    // composition — the failure wave 7F4b was split out to prevent.
    expect(filesWhere(callSitesIn)).toEqual(["room/use-generation.ts"]);
  });

  it("is declared exactly once, so the name above is not a name nothing has", () => {
    // The self-check on the matcher: rename or move the factory and this goes red first, rather
    // than leaving the claim above passing over a spelling the source no longer contains.
    expect(filesWhere(declarationsIn)).toEqual(["room/create-design.ts"]);
  });

  it("counts a second call site, including one the compiler would accept", () => {
    // The falsification. Both shapes below are what a later editor actually writes — a handler and
    // a `useMemo` — and neither is a compile error, which is why a grep is the guard.
    const twoSites = [
      "const attempt = createDesignCreationAttempt({ design, navigateToDesign });",
      "const memoised = useMemo(() => createDesignCreationAttempt({ design }), [design]);",
    ].join("\n");

    expect(callSitesIn(twoSites)).toBe(2);
    // And the declaration itself is not one of them, which is what keeps the count at one today.
    expect(
      callSitesIn("export function createDesignCreationAttempt({ design }) {"),
    ).toBe(0);
  });
});
