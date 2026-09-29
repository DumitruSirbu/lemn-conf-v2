// M7 wave 7D4 slice S1b — the body-choice leaf as ADR 0110 Amendment H leaves it: the ids the
// owner's run order names, and the one answer to *did the storage run compose this module, or the
// block?* (rulings D12, D15).
//
// **What this file can and cannot prove, stated because the criteria it names are larger than the
// leaf.** Under D15 a storage slot's body depends on where the hob stands in the reading order, and
// that is the composer's fact (S2). What is provable here is the half criteria 6 and 7 rest on: the
// leaf offers a storage slot exactly two bodies, they are two different catalogue rows, and each is
// the product its name claims. A whole-design property that never checked this passes against a leaf
// whose two ids are the same string.
//
// **Drawer-front and door-front are read off the catalogue's own `fronts` declaration and are never
// listed here by hand**, and no build id is spelled here either — every one comes from the leaf. The
// catalogue is the one authority for what a row's front is (ADR 0102), exactly as it is for a width,
// and a test that classified them itself would pass against a leaf naming the wrong rows.
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

/** The two bodies a storage slot may take in this wave, in the roles D15 gives them: every slot
 *  takes the first, and the one standing first after the hob in the reading order takes the second
 *  (S2). **`base-panbank` is deliberately absent** — criterion 6's *must not*. */
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

/** What the catalogue says fills this row's front. `drawers > 0` is the declaration itself, not an
 *  inference from a `kind` or a handle edge — ADR 0061's mistake is exactly that inference. */
function hasDrawerFront(buildId: string): boolean {
  const entry = catalogRowFor(buildId);
  // `fronts` is optional on the `BodyCatalog` port and required of every shipped row by two sweeps
  // instead (`void-engine.ts:175-180`), so a missing one means a definition arrived from outside
  // TypeScript — a different failure from a missing row, and `front-population.ts` refuses it the
  // same way rather than reading it as zero drawers.
  if (!entry.fronts) {
    throw new Error(
      `the catalogue row ${buildId} declares no front population`,
    );
  }
  return entry.fronts.drawers > 0;
}

describe("criterion 6 — a storage slot has two bodies to take, and the pan drawer is not one", () => {
  it("offers two ids that are two different catalogue rows", () => {
    // The sabotage this is the only guard against: one id assigned the other's string. Every
    // whole-design property of criteria 6 and 7 stays green under it — the distinct set is still
    // a subset of `{door, drawer}` and every slot still holds a legal body — while the kitchen
    // silently loses the drawer the owner's order puts after the hob.
    expect(new Set(BODIES_A_STORAGE_SLOT_MAY_TAKE).size).toBe(2);
    expect(catalogRowFor(DOOR_BASE_BUILD_ID)).not.toBe(
      catalogRowFor(THREE_DRAWER_BASE_BUILD_ID),
    );
  });

  it("leaves the pan drawer outside the pair, so no storage slot can take it in this wave", () => {
    // 7D5 S2 gave the constant its caller (ADR 0110 Amendment J1), and it is a run item of its own
    // read immediately before the hob — never a body a storage slot is given. That placement is
    // asserted in `pan-drawer-before-the-hob.test.ts`; what stays true here is the pair's edge.
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
    // D1's safety argument at the leaf: a row that could not be built at the width the leftover
    // rule planned would move a tile boundary the merge and `plannedVoid` both depend on. Read
    // from the catalogue entry rather than asserted by name, and never as a width literal — a
    // generation-side copy of a declared size is the second authority ADR 0102 forbids.
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

// ---------------------------------------------------------------------------------------------
// Criterion 22 — D12's guard: the storage run's slots are identified by one exported predicate.
// ---------------------------------------------------------------------------------------------

/** Block sizes 0, 1, 2 and 3, measured against the planner rather than transcribed. Every one of
 *  these rooms puts `role: "storage"` on modules of both provenances or on neither, which is the
 *  ambiguity the predicate exists to resolve. */
const BLOCK_SIZE_WITNESSES: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3300, depthMm: 1600, heightMm: 2600 },
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 2600 },
  { shape: "L", widthMm: 4200, depthMm: 3000, heightMm: 2600 },
  // Past the approved 6000 mm on purpose (M7 7A3): a planner witness, not a policy room.
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
];

function planFor(room: DesignRoom) {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** The 300 mm cargo's catalogue row, spelled as the catalogue spells it rather than imported from the
 *  leaf, so the provenance below never reads production's answer. It is a storage-role body outside
 *  the column band that the storage run did not compose (M7 wave 7D5 S1). */
const BOTTLE_CARGO_CATALOGUE_ID = "base-bottle-cargo";

/** The pan-drawer cabinet's catalogue row, spelled for the same reason as the cargo's. It is the
 *  second storage-role body outside the column band that the storage run did not compose: the
 *  composer reads it immediately before the hob as a run item of its own (M7 wave 7D5 S2, ADR 0110
 *  Amendment J1), so a slot set built by exclusion would otherwise sweep it in. */
const PAN_DRAWER_CATALOGUE_ID = "base-panbank";

/** 7D5b S1 / ADR 0110 M1/M8/M9: the dishwasher's catalogue row, spelled for the same reason as the
 *  cargo's. It is the third storage-role body outside the column band the storage run did not
 *  compose as it stands: M1 re-identifies a 600 mm door slot beside the sink as it, and a
 *  predicate keyed on role, band or width would still call it a slot. */
const DISHWASHER_CATALOGUE_ID = "base-dishwasher";

/** Storage-role bodies the composer reads as run items of their own rather than as slots. */
const ANCILLARY_CATALOGUE_IDS: ReadonlySet<string> = new Set([
  BOTTLE_CARGO_CATALOGUE_ID,
  PAN_DRAWER_CATALOGUE_ID,
  DISHWASHER_CATALOGUE_ID,
]);

/** A module's provenance found **independently of its id**, so the two sides of every assertion
 *  below come from different sources: the block's columns are the storage-role modules the catalogue
 *  declares in the `column` band, the bottle cargo and the pan drawer are each their own catalogue
 *  row, and the storage run's are the rest. `fridge-free` is a column too and is
 *  excluded by its role, which is Amendment A1's and not the block's. */
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
      // The bottle carries the storage role and stands outside the column band, so it is the module a
      // predicate keyed on role and band would sweep in; the storage run did not compose it.
      expect(bottleCargos.filter(isComposedStorageSlot)).toEqual([]);
      // The pan drawer is the same shape of trap as the bottle, one storage module wide besides — so
      // a predicate keyed on role, band or width would call it a slot. The composer placed it.
      expect(panDrawers.filter(isComposedStorageSlot)).toEqual([]);
      // 7D5b S1 / ADR 0110 M1/M8/M9: the dishwasher keeps a converted slot's role, band and span, so
      // it is the sharpest form of the trap. Only its own id keeps it out of *D* (M2).
      expect(dishwashers.filter(isComposedStorageSlot)).toEqual([]);
    }

    // 7D5 S2 moved the composed-slot count from 12 to 11: the 6300 x 4700 witness gives its hob's
    // wall one 600 mm module to the pan drawer (ADR 0110 Amendment J1, Q-H6 = A). Q-H6b then moved
    // one bottle to a pan drawer: 3300 x 1600 drops its fridge, so its wall A run of 2400 mm holds the
    // 1800 mm core with either the 600 mm pan drawer or the 300 mm bottle but not both (2700 mm), and
    // the pan drawer is decided first. Its 300 mm remainder becomes 0; no slot moves. Counted
    // separately, so a pan drawer that the predicate — or this file's grouping — mistook for a slot
    // moves two numbers rather than hiding in one.
    //
    // 7D5b S1 / ADR 0110 M1/M8/M9: 11 composed slots become 7 slots and 4 dishwashers. Every one of
    // the four witnesses converts one 600 mm door slot beside the sink under M1; none takes (e), so
    // the pan-drawer count holds at 2. The sum is conserved (7 + 4 = 11): a re-identification, never a
    // module added or removed.
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

// The repository root, reached by walking out of this package. The scan below skips build output and
// dependencies, so it answers the same whether or not `dist/` has been built.
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

/** The convention as it appears when a module knows it: the prefix opening a string or a template.
 *  A `storage:` that is an object key — `apps/web`'s role maps carry one — is not a reader of this
 *  id and is not matched. */
const CONVENTION_IN_A_LITERAL = /["'`]storage:/;

/** This file. Excluded because the guard has to name the convention in order to count it; it reads
 *  no planned id, and every assertion above reaches a slot through the predicate or through the
 *  catalogue's band. */
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
    // The U's own fridge-wall storage bases are a third writer, `generation/u-fridge-wall.ts` — the
    // identical `storage:<wall>:<index>` convention `generation-priorities.ts` already writes for
    // the L, deliberately reused rather than a second one invented, so `isComposedStorageSlot`
    // recognizes a U's storage bases the same way once a U is generated.
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
    // Criterion 22 asks for **two** sites in the repository. There are two more, and neither reads a
    // planned id — the list is the wave-by-wave record of that, and a fifth namer still fails.
    //
    // 1. 7D2's `generate-kitchen.test.ts` finds a module by `base.id === "storage:A:0"`. It is a
    //    whole-id equality rather than a parse, it predates the predicate, and 7D4 did not edit an
    //    existing assertion to make its own criterion pass — so the deviation was pinned here.
    // 2. 7D8's `qa-7d4-nothing-but-the-body-moved.adversarial.test.ts` pins five whole composed plans
    //    as **expected output**, and a composed plan contains the ids the composer wrote. That file
    //    reaches a slot through `isComposedStorageSlot` everywhere it has to *decide* anything; what
    //    it spells is data the plan produced, and data that stopped matching is what a pinned witness
    //    is for. Masking the ids out of it would hide the field this wave moved.
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

// ---------------------------------------------------------------------------------------------
// Criterion 20 — one declaration site per composed body, and no ratio constant. **Slice S2's, not
// S1's**: at S1 `generation-priorities.ts` still declared its own `STORAGE_BUILD_ID`, so the grep
// could not have passed then, and S2 is the slice that deletes it.
// ---------------------------------------------------------------------------------------------

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

/** A build id as a module writes one down: quoted, or spelled in a comment's backticks. The second
 *  form is deliberately included — a body id named in prose beside code that composes it is exactly
 *  how a second declaration site starts. */
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
    // `shell-design.ts` declares the same string as `FLOOR_TILE_SOURCE`, a **declared depth source**
    // (ADR 0073) that reaches only `TileRun.source` and never a placement. Amendment F14.1 verified
    // every site and scoped the clause rather than deleting it; clause 2 below pins the occurrence.
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

  // 7D5b S1 / ADR 0110 M1/M8/M9: the plan now requires the dishwasher's body id in the leaf. It is
  // written down once, in body-choice.ts, and read by name only there and in the one module that
  // decides where the dishwasher stands — a third reader is how a second placement rule starts.
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
    // An exclusion by filename would buy nothing: this file could then acquire a composed body under
    // cover of the exemption. Pinning the line means a second occurrence goes red.
    const lines = generationSourceOf("shell-design.ts")
      .split("\n")
      .filter((line) => line.includes(`"${DOOR_BASE_BUILD_ID}"`));

    expect(lines).toEqual([
      `const FLOOR_TILE_SOURCE = "${DOOR_BASE_BUILD_ID}";`,
    ]);
  });
});

/**
 * A module's code with its comments removed and its identifiers broken into words.
 *
 * **Comments go** because clause 3 is about what a module *encodes*, and every generation source
 * discusses at length the proportion it refuses to encode — `body-choice.ts`'s own head comment
 * names one four times. A guard that read the prose would go red on the record of the ruling it
 * exists to enforce.
 *
 * **Identifiers are split** because `DRAWER_SHARE` and `drawerShare` are how a constant is actually
 * named, and a word boundary finds neither: `_` and a camel hump are both word characters. Breaking
 * them first is what lets the patterns below be written as plain words.
 */
function codeWordsOf(basename: string): string {
  return generationSourceOf(basename)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
}

/**
 * How a drawer-to-door proportion gets written down: a percentage, a fractional multiplier, an
 * identifier that names a share, or a count divided in two.
 *
 * **The guard's declared limit, stated because one that oversells itself is worse than none.** It
 * catches the ordinary forms — the 50 % the deleted cycle encoded, the wall row's 20–30 %, the 5 % —
 * and does not catch a proportion assembled through an indirection or read from data. What makes
 * that acceptable is that under D14 and Amendment H there is **no proportion to encode at all**: the
 * owner's rule is positional, and the 2-and-4 the owner described survives as a *consequence* of the
 * run order (H7). The clause is unconditional and strictly easier to satisfy than the form F3 wrote.
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
