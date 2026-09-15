// M7 wave 7D4 slice S1 — the body-choice leaf: the storage cycle, and the one answer to *did the
// cycle compose this module?* (ADR 0110 Amendment F, rulings D3, D4, D12).
//
// **Drawer-front and door-front are read off the catalogue's own `fronts` declaration and are never
// listed here by hand.** The balance is a claim about the products the cycle picks, so a test that
// classified them itself would pass against a cycle picking the wrong ones — the catalogue is the one
// authority for what a row's front is (ADR 0102), exactly as it is for a width.
//
// **The slot counts are swept exhaustively rather than sampled.** The cycle is a total function of
// one small integer, so the whole range is cheaper than a property over it and leaves no arm to
// starve. Eight is the most slots any approved room composes; the sweep runs far past it so what
// passes is the cycle's shape rather than the range it was checked over.
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
  DOOR_BASE_BUILD_ID,
  isCycleStorageSlot,
  PAN_DRAWER_BASE_BUILD_ID,
  storageBodyAt,
  THREE_DRAWER_BASE_BUILD_ID,
} from "../../src/generation/body-choice.js";

const CATALOG = buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN));
const DECLARED_COLUMNS = declaredColumnSizes(CATALOG);

/** Well past the eight slots of the largest approved room (6300 x 4700 x 2600), so a cycle that
 *  happened to behave over a short run has nowhere to hide. */
const LONGEST_SWEPT_RUN = 40;

/** Every general storage body the catalogue can build at 600 mm, by enumeration of
 *  `buildKitchenLBodyCatalog` at base height: `base-cabinet`, `base-3drawer` and `base-panbank`.
 *  **Pinned as a literal deliberately.** When a fourth row arrives this goes red, and that redness is
 *  the notification that the cycle owes it a step (ADR 0118). */
const DISTINCT_STORAGE_BODIES_AVAILABLE = 3;

function sequenceOf(slotCount: number): readonly string[] {
  return Array.from({ length: slotCount }, (_, index) => storageBodyAt(index));
}

/** What the catalogue says fills this row's front. `drawers > 0` is the declaration itself, not an
 *  inference from a `kind` or a handle edge — ADR 0061's mistake is exactly that inference. */
function hasDrawerFront(buildId: string): boolean {
  const entry = CATALOG.get(buildId);
  if (!entry) {
    throw new Error(`the catalogue declares no row ${buildId}`);
  }
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

describe("storageBodyAt refuses a position that is not a whole slot", () => {
  it("throws on a negative index rather than wrapping to the end of the cycle", () => {
    expect(() => storageBodyAt(-1)).toThrow(/non-negative whole slot position/);
  });

  it("throws on a fractional index rather than truncating it", () => {
    expect(() => storageBodyAt(1.5)).toThrow(
      /non-negative whole slot position/,
    );
  });
});

describe("criterion 3 — the balance is a consequence of the cycle's shape", () => {
  it("splits evenly at every even slot count and gives drawers the extra at every odd one", () => {
    for (let slotCount = 0; slotCount <= LONGEST_SWEPT_RUN; slotCount += 1) {
      const bodies = sequenceOf(slotCount);
      const drawerBodies = bodies.filter(hasDrawerFront).length;
      const doorBodies = bodies.length - drawerBodies;

      // Doors never outnumber drawers, and the gap is one exactly where the count is odd — all
      // three clauses of the criterion, held by one difference so none can pass while another fails.
      expect({ slotCount, classified: drawerBodies + doorBodies }).toEqual({
        slotCount,
        classified: slotCount,
      });
      expect({ slotCount, lead: drawerBodies - doorBodies }).toEqual({
        slotCount,
        lead: slotCount % 2,
      });
    }
  });
});

describe("criterion 4 — the owner's own example, derived rather than special-cased", () => {
  it("composes six slots as three drawer bodies and three door bodies", () => {
    const bodies = sequenceOf(6);

    expect(bodies.filter(hasDrawerFront)).toHaveLength(3);
    expect(bodies.filter((buildId) => !hasDrawerFront(buildId))).toHaveLength(
      3,
    );
  });

  it("reaches that split through the alternation and not through a count of six", () => {
    expect(sequenceOf(6)).toEqual([
      THREE_DRAWER_BASE_BUILD_ID,
      DOOR_BASE_BUILD_ID,
      PAN_DRAWER_BASE_BUILD_ID,
      DOOR_BASE_BUILD_ID,
      THREE_DRAWER_BASE_BUILD_ID,
      DOOR_BASE_BUILD_ID,
    ]);
  });
});

describe("criterion 6 — maximum variety, quantified", () => {
  it("shows min(3, slotCount) distinct bodies at every slot count", () => {
    for (let slotCount = 0; slotCount <= LONGEST_SWEPT_RUN; slotCount += 1) {
      const distinct = new Set(sequenceOf(slotCount));

      expect({ slotCount, distinct: distinct.size }).toEqual({
        slotCount,
        distinct: Math.min(DISTINCT_STORAGE_BODIES_AVAILABLE, slotCount),
      });
    }
  });
});

describe("criterion 7 — no two adjacent slots carry the same body", () => {
  it("alternates along the sequence", () => {
    const bodies = sequenceOf(LONGEST_SWEPT_RUN);

    expect(bodies).toHaveLength(LONGEST_SWEPT_RUN);
    for (let slotIndex = 1; slotIndex < bodies.length; slotIndex += 1) {
      expect({ slotIndex, body: bodies[slotIndex] }).not.toEqual({
        slotIndex,
        body: bodies[slotIndex - 1],
      });
    }
  });

  it("still alternates read backwards, which is the direction wall B consumes", () => {
    // Wall B's slots are consumed in the reverse of their spatial order (ADR 0110 F / G12), so the
    // pairs a wall sees are the sequence's own pairs in the other direction. Asserted rather than
    // argued, because the whole defect this wave removes is a run of identical neighbours.
    const backwards = [...sequenceOf(LONGEST_SWEPT_RUN)].reverse();

    for (let slotIndex = 1; slotIndex < backwards.length; slotIndex += 1) {
      expect({ slotIndex, body: backwards[slotIndex] }).not.toEqual({
        slotIndex,
        body: backwards[slotIndex - 1],
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 22 — D12's guard: the cycle's slots are identified by one exported predicate.
// ---------------------------------------------------------------------------------------------

/** Block sizes 0, 1, 2 and 3, measured against the planner rather than transcribed. Every one of
 *  these rooms puts `role: "storage"` on modules of both provenances or on neither, which is the
 *  ambiguity the predicate exists to resolve. */
const BLOCK_SIZE_WITNESSES: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3300, depthMm: 1600, heightMm: 2600 },
  { shape: "L", widthMm: 3300, depthMm: 1700, heightMm: 2600 },
  { shape: "L", widthMm: 4000, depthMm: 3000, heightMm: 2600 },
  { shape: "L", widthMm: 6300, depthMm: 4700, heightMm: 2600 },
];

function planFor(room: DesignRoom) {
  return planKitchenComposition({
    room,
    runs: lShellFloorRuns(room),
    columns: DECLARED_COLUMNS,
  });
}

/** A module's provenance found **independently of its id**, so the two sides of every assertion
 *  below come from different sources: the block's columns are the storage-role modules the catalogue
 *  declares in the `column` band, and the cycle's are the rest. `fridge-free` is a column too and is
 *  excluded by its role, which is Amendment A1's and not the block's. */
function storageRoleModulesByBand(plan: ReturnType<typeof planFor>) {
  const storageRole = plan.bases.filter((base) => base.role === "storage");
  return {
    blockColumns: storageRole.filter(
      (base) => CATALOG.get(base.buildId)?.band === "column",
    ),
    cycleSlots: storageRole.filter(
      (base) => CATALOG.get(base.buildId)?.band !== "column",
    ),
  };
}

describe("criterion 22 — one predicate separates the cycle's slots from the block's columns", () => {
  it("covers block sizes 0, 1, 2 and 3, so neither arm of the ambiguity is unwitnessed", () => {
    const sizes = BLOCK_SIZE_WITNESSES.map(
      (room) => storageRoleModulesByBand(planFor(room)).blockColumns.length,
    );

    expect([...sizes].sort((left, right) => left - right)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("answers true for every module the cycle composed and false for every block column", () => {
    let cycleSlotsSeen = 0;
    let blockColumnsSeen = 0;

    for (const room of BLOCK_SIZE_WITNESSES) {
      const plan = planFor(room);
      const { blockColumns, cycleSlots } = storageRoleModulesByBand(plan);
      cycleSlotsSeen += cycleSlots.length;
      blockColumnsSeen += blockColumns.length;

      expect(cycleSlots.filter(isCycleStorageSlot)).toEqual(cycleSlots);
      expect(blockColumns.filter(isCycleStorageSlot)).toEqual([]);
    }

    expect({ cycleSlotsSeen, blockColumnsSeen }).toEqual({
      cycleSlotsSeen: 12,
      blockColumnsSeen: 6,
    });
  });

  it("answers false for every core role, whose id is the role's own name", () => {
    for (const room of BLOCK_SIZE_WITNESSES) {
      const core = planFor(room).bases.filter(
        (base) => base.role !== "storage",
      );

      expect(core.length).toBeGreaterThan(0);
      expect(core.filter(isCycleStorageSlot)).toEqual([]);
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
const NOT_SOURCE = new Set([
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
  it("names it in the predicate that reads it and the one Array.from that writes it, and nowhere else in src", () => {
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
    ]);
  });

  it("is named by exactly one test besides this guard, and that one is a reported deviation", () => {
    // Criterion 22 asks for **two** sites in the repository. There is a third: 7D2's
    // `generate-kitchen.test.ts` finds a module by `base.id === "storage:A:0"`. It is a whole-id
    // equality rather than a parse, it predates the predicate, and this wave does not edit an
    // existing assertion to make its own criterion pass — so the deviation is pinned here instead,
    // and a fourth reader still fails.
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
