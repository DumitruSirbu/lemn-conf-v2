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
// **Two instruments.** The source read proves each call is written inside the assembler over the entries
// the map is built from. The last block drives the load with a row smuggled in through a module mock,
// which is what catches a call that is written and does not run. Whether a refusal's own body works is
// `cabinet-depth-parameter.test.ts` and `front-population.test.ts`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as CatalogModule from "../src/catalog.js";
import type * as FixtureModule from "../src/fixtures/kitchen-l-design.js";
import {
  doorBandsMm,
  type FrontPopulationRule,
} from "../src/front-population.js";
import type { BodyDefinition } from "../src/void-engine.js";

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
});

// The source read above accepts a call that is written and never runs. This drives the load itself: a row only a
// call site can refuse is put among the entries the assembler collects, and the catalogue must not load.
describe("a refusal that is only written about does not stop a catalogue loading; one that runs does", () => {
  const CATALOG_MODULE = "../src/catalog.js";
  const FIXTURE_MODULE = "../src/fixtures/kitchen-l-design.js";
  const SMUGGLED_BUILD_ID = "row-from-outside-typescript";
  /** A shipped row the smuggled one is a copy of, so only the one field under test is wrong. */
  const COPIED_BUILD_ID = "wall-cabinet";

  type Corrupt = (definition: BodyDefinition) => BodyDefinition;

  /** One band and no leaf to stand in it, as `front-population.test.ts` declares the contradiction. */
  const CONTRADICTORY_FRONTS = {
    countedFrom: "declared-leaves",
    doorBands: doorBandsMm([710]),
    leavesPerBand: 0,
    drawers: 0,
  } as unknown as FrontPopulationRule;

  /** A row as plain JavaScript would hand it over: every field but its depth rule. */
  function withoutItsDepthRule(definition: BodyDefinition): BodyDefinition {
    return Object.fromEntries(
      Object.entries(definition).filter(([field]) => field !== "depthRule"),
    ) as unknown as BodyDefinition;
  }

  const ROWS_ONLY_A_CALL_SITE_REFUSES: readonly (readonly [
    string,
    Corrupt,
    string,
  ])[] = [
    [
      "a row declaring no depth rule",
      withoutItsDepthRule,
      "UndeclaredCabinetDepthRuleError",
    ],
    [
      "a row whose bands and leaves disagree",
      (definition) => ({ ...definition, fronts: CONTRADICTORY_FRONTS }),
      "ContradictoryFrontDeclarationError",
    ],
  ];

  function smuggleIntoTheInsertableEntries(corrupt: Corrupt): void {
    vi.doMock(CATALOG_MODULE, async (importOriginal) => {
      const original = await importOriginal<typeof CatalogModule>();
      return {
        ...original,
        buildInsertableBodyDefinitions: (cabinetDepthMm: number) => {
          const entries =
            original.buildInsertableBodyDefinitions(cabinetDepthMm);
          const copied = entries.find(
            ([buildId]) => buildId === COPIED_BUILD_ID,
          );
          if (!copied) throw new Error(`${COPIED_BUILD_ID} left the catalogue`);
          return [...entries, [SMUGGLED_BUILD_ID, corrupt(copied[1])]];
        },
      };
    });
  }

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock(CATALOG_MODULE);
    vi.resetModules();
  });

  it.each(ROWS_ONLY_A_CALL_SITE_REFUSES)(
    "refuses to load a catalogue holding %s, naming it",
    async (_what, corrupt, errorName) => {
      smuggleIntoTheInsertableEntries(corrupt);

      const loading = import(FIXTURE_MODULE);

      await expect(loading).rejects.toMatchObject({ name: errorName });
      await expect(loading).rejects.toThrow(SMUGGLED_BUILD_ID);
    },
  );

  // The premise of the rows above: the smuggling itself stops nothing, so a refusal is the row's.
  it("loads a catalogue holding a smuggled row with nothing wrong in it", async () => {
    smuggleIntoTheInsertableEntries((definition) => definition);

    const fixture = (await import(FIXTURE_MODULE)) as typeof FixtureModule;

    expect(fixture.KITCHEN_L_BODY_CATALOG.has(SMUGGLED_BUILD_ID)).toBe(true);
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
