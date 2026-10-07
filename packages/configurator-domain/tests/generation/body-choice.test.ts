// The body-choice leaf as ADR 0110 Amendment H leaves it: the ids the owner's run order names and the one answer
// to "did the storage run compose this module, or the block?". Provable here is the half the whole-design
// properties rest on: the leaf offers a storage slot exactly two bodies, they are different catalogue rows, and
// each is the product its name claims. Drawer-front and door-front are read off the catalogue's `fronts`
// declaration, never listed by hand (ADR 0102): a test that classified them itself would pass against a leaf
// naming the wrong rows.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredColumnSizes,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type DesignRoom,
} from "../../src/index.js";
import {
  BOTTLE_CARGO_BUILD_ID,
  DISHWASHER_BUILD_ID,
  DOOR_BASE_BUILD_ID,
  isComposedStorageSlot,
  PAN_DRAWER_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
} from "../../src/generation/body-choice.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** The two bodies a storage slot may take: every slot takes the first, and the one standing first after the hob
 *  in the reading order takes the second. `base-panbank` is deliberately absent. */
const BODIES_A_STORAGE_SLOT_MAY_TAKE: readonly string[] = [
  DOOR_BASE_BUILD_ID,
  THREE_DRAWER_BASE_BUILD_ID,
];

function catalogRowFor(buildId: string) {
  const entry = CATALOG.get(buildId);
  if (!entry) {
    throw new Error(`the catalogue declares no row ${buildId}`);
  }
  return entry;
}

/** What the catalogue says fills this row's front: `drawers > 0` is the declaration itself, not an inference
 *  from a `kind` or a handle edge (ADR 0061). */
function hasDrawerFront(buildId: string): boolean {
  const entry = catalogRowFor(buildId);
  // `fronts` is optional on the `BodyCatalog` port, so a missing one means a definition arrived from outside
  // TypeScript: a different failure from a missing row, which `front-population.ts` refuses the same way rather
  // than reading zero drawers.
  if (!entry.fronts) {
    throw new Error(
      `the catalogue row ${buildId} declares no front population`,
    );
  }
  return entry.fronts.drawers > 0;
}

describe("criterion 6 — a storage slot has two bodies to take, and the pan drawer is not one", () => {
  it("offers two ids that are two different catalogue rows", () => {
    // The sabotage this alone catches: one id assigned the other's string leaves every whole-design property
    // green while the kitchen silently loses the drawer the owner's order puts after the hob.
    expect(new Set(BODIES_A_STORAGE_SLOT_MAY_TAKE).size).toBe(2);
    expect(catalogRowFor(DOOR_BASE_BUILD_ID)).not.toBe(
      catalogRowFor(THREE_DRAWER_BASE_BUILD_ID),
    );
  });

  it("leaves the pan drawer outside the pair, so no storage slot can take it in this wave", () => {
    // The pan drawer is a run item of its own, read immediately before the hob and never a body a storage slot is
    // given (ADR 0110 Amendment J1); `pan-drawer-before-the-hob.test.ts` asserts that placement.
    expect(BODIES_A_STORAGE_SLOT_MAY_TAKE).not.toContain(
      PAN_DRAWER_BASE_BUILD_ID,
    );
    expect(catalogRowFor(PAN_DRAWER_BASE_BUILD_ID)).not.toBe(
      catalogRowFor(THREE_DRAWER_BASE_BUILD_ID),
    );
  });
});

describe("criterion 7 — each id is the product its name claims, read off the catalogue", () => {
  it("names a door body that declares no drawer front", () => {
    expect(hasDrawerFront(DOOR_BASE_BUILD_ID)).toBe(false);
  });

  it("names a drawer body that declares drawers", () => {
    expect(hasDrawerFront(THREE_DRAWER_BASE_BUILD_ID)).toBe(true);
  });
});

describe("the leaf changes a body's identity and never its width", () => {
  it("declares every body as a fit-width base row, so each drops into its planned tile", () => {
    // A row that could not be built at the width the leftover rule planned would move a tile boundary the merge and
    // `plannedVoid` depend on. Read from the catalogue entry, never a width literal: a generation-side copy of a
    // declared size is the second authority ADR 0102 forbids.
    for (const buildId of [
      ...BODIES_A_STORAGE_SLOT_MAY_TAKE,
      PAN_DRAWER_BASE_BUILD_ID,
    ]) {
      const row = catalogRowFor(buildId);

      expect({ buildId, band: row.band, widthFlex: row.widthFlex }).toEqual({
        buildId,
        band: "base",
        widthFlex: "fit",
      });
    }
  });
});

/** Block sizes 0, 1, 2 and 3, measured against the planner. Every room puts `role: "storage"` on modules of both
 *  provenances or on neither, the ambiguity the predicate exists to resolve. */
const BLOCK_SIZE_WITNESSES: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3300, depthMm: 1600, heightMm: 2600 },
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 2600 },
  { shape: "L", widthMm: 4200, depthMm: 3000, heightMm: 2600 },
  // Past the approved 6000 mm on purpose: a planner witness, not a policy room.
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
];

function planFor(room: DesignRoom) {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** The 300 mm cargo's catalogue row, spelled as the catalogue spells it so the provenance never reads
 *  production's answer: a storage-role body outside the column band that the storage run did not compose. */
const BOTTLE_CARGO_CATALOGUE_ID = "base-bottle-cargo";

/** The pan-drawer cabinet's row, spelled likewise: the composer reads it immediately before the hob as a run item,
 *  so a slot set built by exclusion would sweep it in. */
const PAN_DRAWER_CATALOGUE_ID = "base-panbank";

/** The dishwasher's row, spelled likewise: ADR 0110 M1 re-identifies a 600 mm door slot beside the sink as it, and
 *  a predicate keyed on role, band or width would still call it a slot. */
const DISHWASHER_CATALOGUE_ID = "base-dishwasher";

/** Storage-role bodies the composer reads as run items of their own rather than as slots. */
const ANCILLARY_CATALOGUE_IDS: ReadonlySet<string> = new Set([
  BOTTLE_CARGO_CATALOGUE_ID,
  PAN_DRAWER_CATALOGUE_ID,
  DISHWASHER_CATALOGUE_ID,
]);

/** A module's provenance found independently of its id, so the two sides of every assertion come from different
 *  sources: block columns are the storage-role modules the catalogue declares in the `column` band, the cargo and
 *  pan drawer are their own rows, and the storage run's are the rest. `fridge-free` is a column excluded by its
 *  role (ADR 0110 A1). */
function storageRoleModulesByBand(plan: ReturnType<typeof planFor>) {
  const storageRole = plan.bases.filter((base) => base.role === "storage");
  const outsideTheColumnBand = storageRole.filter(
    (base) => CATALOG.get(base.buildId)?.band !== "column",
  );
  return {
    blockColumns: storageRole.filter(
      (base) => CATALOG.get(base.buildId)?.band === "column",
    ),
    bottleCargos: outsideTheColumnBand.filter(
      (base) => base.buildId === BOTTLE_CARGO_CATALOGUE_ID,
    ),
    panDrawers: outsideTheColumnBand.filter(
      (base) => base.buildId === PAN_DRAWER_CATALOGUE_ID,
    ),
    dishwashers: outsideTheColumnBand.filter(
      (base) => base.buildId === DISHWASHER_CATALOGUE_ID,
    ),
    composedSlots: outsideTheColumnBand.filter(
      (base) => !ANCILLARY_CATALOGUE_IDS.has(base.buildId),
    ),
  };
}

describe("criterion 22 — one predicate separates the storage run's slots from the block's columns", () => {
  it("covers block sizes 0, 1, 2 and 3, so neither arm of the ambiguity is unwitnessed", () => {
    const sizes = BLOCK_SIZE_WITNESSES.map(
      (room) => storageRoleModulesByBand(planFor(room)).blockColumns.length,
    );

    expect([...sizes].sort((left, right) => left - right)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("answers true for every module the storage run composed and false for every block column", () => {
    let composedSlotsSeen = 0;
    let blockColumnsSeen = 0;
    let bottleCargosSeen = 0;
    let panDrawersSeen = 0;
    let dishwashersSeen = 0;

    for (const room of BLOCK_SIZE_WITNESSES) {
      const plan = planFor(room);
      const {
        blockColumns,
        bottleCargos,
        panDrawers,
        dishwashers,
        composedSlots,
      } = storageRoleModulesByBand(plan);
      composedSlotsSeen += composedSlots.length;
      blockColumnsSeen += blockColumns.length;
      bottleCargosSeen += bottleCargos.length;
      panDrawersSeen += panDrawers.length;
      dishwashersSeen += dishwashers.length;

      expect(composedSlots.filter(isComposedStorageSlot)).toEqual(
        composedSlots,
      );
      expect(blockColumns.filter(isComposedStorageSlot)).toEqual([]);
      // A predicate keyed on role and band would sweep the bottle in; the storage run did not compose it.
      expect(bottleCargos.filter(isComposedStorageSlot)).toEqual([]);
      // The same trap, one storage module wide; the composer placed it.
      expect(panDrawers.filter(isComposedStorageSlot)).toEqual([]);
      // The dishwasher keeps a converted slot's role, band and span, so only its own id keeps it out of D
      // (ADR 0110 M2).
      expect(dishwashers.filter(isComposedStorageSlot)).toEqual([]);
    }

    // Pan drawers, bottles and dishwashers are counted separately, so one the predicate mistook for a slot moves two
    // numbers rather than hiding in one. The 11 composed slots are 7 slots and 4 dishwashers: each of the four
    // witnesses converts one 600 mm door slot beside the sink (M1) and none takes (e), so the sum is conserved.
    expect({
      composedSlotsSeen,
      blockColumnsSeen,
      bottleCargosSeen,
      panDrawersSeen,
      dishwashersSeen,
    }).toEqual({
      composedSlotsSeen: 7,
      blockColumnsSeen: 6,
      bottleCargosSeen: 3,
      panDrawersSeen: 2,
      dishwashersSeen: 4,
    });
  });

  it("answers false for every core role, whose id is the role's own name", () => {
    for (const room of BLOCK_SIZE_WITNESSES) {
      const core = planFor(room).bases.filter(
        (base) => base.role !== "storage",
      );

      expect(core.length).toBeGreaterThan(0);
      expect(core.filter(isComposedStorageSlot)).toEqual([]);
    }
  });
});

// The repository root. The scan skips build output and dependencies, so it answers the same whether or not
// `dist/` has been built.
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
// `.claude` holds agents' git worktrees — whole copies of this repository — so walking it counts
// every module twice.
const NOT_SOURCE = new Set([
  ".claude",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

/** The convention as a module knows it: the prefix opening a string or a template. An object key, like those in
 *  `apps/web`'s role maps, is not a reader of this id and is not matched. */
const CONVENTION_IN_A_LITERAL = /["'`]storage:/;

/** This file: excluded because the guard has to name the convention to count it; it reads no planned id. */
const THIS_GUARD = path.relative(
  REPOSITORY_ROOT,
  fileURLToPath(import.meta.url),
);

function typeScriptFilesUnder(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return NOT_SOURCE.has(entry.name) ? [] : typeScriptFilesUnder(full);
    }
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [path.relative(REPOSITORY_ROOT, full)]
      : [];
  });
}

function modulesNamingTheConvention(): readonly string[] {
  return typeScriptFilesUnder(REPOSITORY_ROOT)
    .filter((file) => file !== THIS_GUARD)
    .filter((file) =>
      CONVENTION_IN_A_LITERAL.test(
        readFileSync(path.join(REPOSITORY_ROOT, file), "utf8"),
      ),
    )
    .sort();
}

describe("criterion 22 — nothing else in the repository knows the id convention", () => {
  it("names it in the predicate that reads it and its two writers, and nowhere else in src", () => {
    // The U's fridge-wall storage bases (`generation/u-fridge-wall.ts`) are a third writer of the identical id
    // convention `generation-priorities.ts` writes for the L, so `isComposedStorageSlot` recognizes them too.
    const shipped = modulesNamingTheConvention().filter((file) =>
      file.includes(`${path.sep}src${path.sep}`),
    );

    expect(shipped).toEqual([
      path.join(
        "packages",
        "configurator-domain",
        "src",
        "generation",
        "body-choice.ts",
      ),
      path.join(
        "packages",
        "configurator-domain",
        "src",
        "generation",
        "generation-priorities.ts",
      ),
      path.join(
        "packages",
        "configurator-domain",
        "src",
        "generation",
        "u-fridge-wall.ts",
      ),
    ]);
  });

  it("is named by exactly two tests besides this guard, and both are reported deviations", () => {
    // Two tests besides this guard name the convention: `generate-kitchen.test.ts` finds a module by whole-id
    // equality (it predates the predicate), and `qa-7d4-nothing-but-the-body-moved.adversarial.test.ts` pins whole
    // composed plans as expected output, whose ids are data the plan produced. A third namer still fails.
    const inTests = modulesNamingTheConvention().filter((file) =>
      file.includes(`${path.sep}tests${path.sep}`),
    );

    expect(inTests).toEqual([
      path.join(
        "packages",
        "configurator-domain",
        "tests",
        "generation",
        "generate-kitchen.test.ts",
      ),
      path.join(
        "packages",
        "configurator-domain",
        "tests",
        "generation",
        "qa-7d4-nothing-but-the-body-moved.adversarial.test.ts",
      ),
    ]);
  });

  it("is named nowhere else at all", () => {
    const outsideSourceAndTests = modulesNamingTheConvention().filter(
      (file) =>
        !file.includes(`${path.sep}src${path.sep}`) &&
        !file.includes(`${path.sep}tests${path.sep}`),
    );

    expect(outsideSourceAndTests).toEqual([]);
  });
});

const GENERATION_SOURCE = path.join(
  "packages",
  "configurator-domain",
  "src",
  "generation",
);

function generationModules(): readonly string[] {
  return typeScriptFilesUnder(path.join(REPOSITORY_ROOT, GENERATION_SOURCE))
    .map((file) => path.basename(file))
    .sort();
}

function generationSourceOf(basename: string): string {
  return readFileSync(
    path.join(REPOSITORY_ROOT, GENERATION_SOURCE, basename),
    "utf8",
  );
}

/** A build id as a module writes one down: quoted, or in a comment's backticks. The second is included because a
 *  body id named in prose beside code that composes it is how a second declaration site starts. */
function generationModulesNaming(buildId: string): readonly string[] {
  const asWritten = new RegExp(`["'\`]${buildId}`);
  return generationModules().filter((basename) =>
    asWritten.test(generationSourceOf(basename)),
  );
}

/** Modules that mention an exported identifier by name, as a whole word. */
function generationModulesReading(identifier: string): readonly string[] {
  const asAWord = new RegExp(`\\b${identifier}\\b`);
  return generationModules().filter((basename) =>
    asAWord.test(generationSourceOf(basename)),
  );
}

describe("criterion 20 clause 1 — body-choice.ts is the only module that declares a composed body", () => {
  it.each([THREE_DRAWER_BASE_BUILD_ID, PAN_DRAWER_BASE_BUILD_ID])(
    "names %s in that leaf and nowhere else under src/generation",
    (buildId) => {
      expect(generationModulesNaming(buildId)).toEqual(["body-choice.ts"]);
    },
  );

  it("names the door body in that leaf and in the one pinned depth source", () => {
    // `shell-design.ts` declares the same string as `FLOOR_TILE_SOURCE`, a declared depth source (ADR 0073) that
    // reaches only `TileRun.source`, never a placement; clause 2 below pins the occurrence.
    expect(generationModulesNaming(DOOR_BASE_BUILD_ID)).toEqual([
      "body-choice.ts",
      "shell-design.ts",
    ]);
  });

  it("names the bottle cargo in the body-choice leaf and nowhere else", () => {
    expect(generationModulesNaming(BOTTLE_CARGO_BUILD_ID)).toEqual([
      "body-choice.ts",
    ]);
  });

  // The dishwasher's body id is written down once, in body-choice.ts, and read by name only there and in the module
  // that decides where the dishwasher stands; a third reader is how a second placement rule starts.
  it("names the dishwasher only in body-choice.ts and the dishwasher leaf", () => {
    expect(generationModulesNaming(DISHWASHER_BUILD_ID)).toEqual([
      "body-choice.ts",
    ]);
    expect(generationModulesReading("DISHWASHER_BUILD_ID")).toEqual([
      "body-choice.ts",
      "dishwasher-beside-the-sink.ts",
    ]);
  });
});

describe("criterion 20 clause 2 — the depth source is pinned, not excluded by filename", () => {
  it("writes the door body's string exactly once in shell-design.ts, on the FLOOR_TILE_SOURCE line", () => {
    // An exclusion by filename would let this file acquire a composed body under cover of the exemption; pinning
    // the line turns a second occurrence red.
    const lines = generationSourceOf("shell-design.ts")
      .split("\n")
      .filter((line) => line.includes(`"${DOOR_BASE_BUILD_ID}"`));

    expect(lines).toEqual([
      `const FLOOR_TILE_SOURCE = "${DOOR_BASE_BUILD_ID}";`,
    ]);
  });
});

/**
 * A module's code with its comments removed and its identifiers broken into words. Comments go because clause 3 is
 * about what a module encodes, and sources discuss at length the proportion they refuse to encode. Identifiers
 * split because `DRAWER_SHARE` and `drawerShare` have no word boundary (`_` and a camel hump are word characters).
 */
function codeWordsOf(basename: string): string {
  return generationSourceOf(basename)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
}

/**
 * How a drawer-to-door proportion gets written down: a percentage, a fractional multiplier, an identifier that
 * names a share, or a count divided in two. Declared limit: a proportion assembled through an indirection or read
 * from data is not caught; acceptable because the owner's rule is positional and encodes no proportion
 * (ADR 0110 Amendment H).
 */
const A_PROPORTION_ENCODED: readonly RegExp[] = [
  /\d\s*%/,
  /\b0\.\d/,
  /\b(ratio|percent|percentage|proportion|share|half|halve|alternating|everyOther)\b/i,
  /\b\w*(count|slots|bodies|cabinets)\s*(\/|>>)\s*\d/i,
];

describe("criterion 20 clause 3 — no file under src/generation encodes a proportion", () => {
  it.each(A_PROPORTION_ENCODED.map((pattern) => [pattern.source, pattern]))(
    "writes nothing matching %s in any generation module's code",
    (_label, pattern) => {
      const offenders = generationModules().filter((basename) =>
        pattern.test(codeWordsOf(basename)),
      );

      expect(offenders).toEqual([]);
    },
  );
});
