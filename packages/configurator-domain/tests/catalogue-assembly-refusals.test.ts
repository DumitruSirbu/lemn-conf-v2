// **The two refusals `buildKitchenLBodyCatalog` is supposed to run, held to being run.**
//
// `refuseUndeclaredDepthRules` (ADR 0058 decision 2) and `refuseContradictoryFrontDeclarations`
// (ADR 0070, wave 6S) both guard the same seam: a `BodyDefinition` arriving through the `BodyCatalog`
// port from outside TypeScript, which reaches no required field and no constructor. Both are
// exercised as functions elsewhere — `cabinet-depth-parameter.test.ts` and
// `front-population.test.ts` — and **neither call site was held by anything.** Commenting either one
// out left all 2206 domain tests green, because no shipped row can trigger either: every §7 row is a
// compile error without its declaration, and every constructed rule is refused where it is
// constructed. The guards are for inputs the shipped catalogue cannot produce, so the shipped
// catalogue cannot notice them going missing.
//
// **Why this reads the source instead of driving the behaviour, which would be the stronger test.**
// A behavioural pin needs a contradictory or undeclared row to reach catalogue *load*, and
// `buildKitchenLBodyCatalog` takes a depth and assembles its entries from two internal builders —
// there is no seam to inject one through. Making one would mean changing the function's production
// signature to accept an entries source, which is a larger change than the thing it would pin.
// Reading the source is therefore the instrument, and it is this package's own: the same technique
// `qa-6b2-door-step-and-height.adversarial.test.ts` uses to pin a caller population, and
// `pricing-seams.test.ts` to pin an absence.
//
// **What it proves and what it does not.** It proves the call is written, inside that function, over
// the entries the map is built from. It does not prove the refusal works — that is the two suites
// named above — and it would not catch a refusal that was called and whose body had been emptied.
// Those are different failures with their own tests; this one covers the failure that had none.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** The assembler both refusals must run inside. Named once: a rename that moved the refusals
 *  somewhere else would fail here rather than quietly stop asserting anything. */
const ASSEMBLER = "buildKitchenLBodyCatalog";

/** The local the entries are collected into, and what each refusal must be handed. A refusal called
 *  on something else — one population, or a freshly built list — would guard less than it claims. */
const ENTRIES = "entries";

const FIXTURE_SOURCE = "src/fixtures/kitchen-l-design.ts";

/** Every refusal the assembler is required to run, with the record that put it there. A closed list:
 *  a third guard added to the seam and not wired in is the defect this file exists for, and it is
 *  added here at the same time as the call or it is not guarded. */
const REQUIRED_REFUSALS: readonly { name: string; why: string }[] = [
  {
    name: "refuseUndeclaredDepthRules",
    why: "ADR 0058 decision 2: a seeded row that declares no depth rule is refused at load",
  },
  {
    name: "refuseContradictoryFrontDeclarations",
    why: "ADR 0070 / wave 6S: a port-supplied row whose bands and leaves disagree is refused at load",
  },
];

describe("the catalogue assembler runs every refusal it is supposed to", () => {
  const body = assemblerBody();

  it.each(REQUIRED_REFUSALS.map((refusal) => [refusal.name, refusal] as const))(
    "calls %s on the assembled entries",
    (_name, refusal) => {
      expect(body, refusal.why).toContain(`${refusal.name}(${ENTRIES})`);
    },
  );

  // The mechanism's own premise. If the body could not be found, or came back empty, every
  // assertion above would pass or fail for a reason that has nothing to do with the call sites.
  it("found a body to read, and it is the assembler's", () => {
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain(`const ${ENTRIES} =`);
    expect(body).toContain("new Map");
  });

  // Comments and strings are stripped, so a refusal *mentioned* in prose does not satisfy the
  // assertions above — which matters in a package that comments more than it codes, and where both
  // refusals are named in comments a few lines from their calls.
  it("does not accept a refusal that is only written about", () => {
    const commentedOut = withoutCommentsOrStrings(
      `function ${ASSEMBLER}() {\n` +
        `  // ${REQUIRED_REFUSALS[0]?.name ?? ""}(${ENTRIES});\n` +
        `  return new Map();\n}`,
    );

    expect(commentedOut).not.toContain(
      `${REQUIRED_REFUSALS[0]?.name ?? ""}(${ENTRIES})`,
    );
  });
});

/** The assembler's body, with comments and string literals stripped — matched by counting braces
 *  from its own `{`, so the read stops at the function and not at the next one down the file. */
function assemblerBody(): string {
  const source = withoutCommentsOrStrings(readPackageSource(FIXTURE_SOURCE));
  const declaredAt = source.indexOf(`function ${ASSEMBLER}(`);
  expect(
    declaredAt,
    `${FIXTURE_SOURCE} declares no ${ASSEMBLER}`,
  ).toBeGreaterThanOrEqual(0);

  const opensAt = source.indexOf("{", declaredAt);
  let depth = 0;
  for (let at = opensAt; at < source.length; at++) {
    if (source[at] === "{") depth += 1;
    if (source[at] === "}") depth -= 1;
    if (depth === 0) return source.slice(opensAt, at + 1);
  }
  throw new Error(`${ASSEMBLER} has no closing brace`);
}

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readPackageSource(relativePath: string): string {
  return readFileSync(path.join(SOURCE_ROOT, relativePath), "utf8");
}

/** `qa-6b2-door-step-and-height.adversarial.test.ts`'s own helper, duplicated rather than shared:
 *  test infrastructure lives in the file that needs it or under `tests/support/`, and a two-caller
 *  regex is not worth a module. */
function withoutCommentsOrStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}
