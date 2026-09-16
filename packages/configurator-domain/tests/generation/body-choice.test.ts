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
  DOOR_BASE_BUILD_ID,
  isCycleStorageSlot,
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
    // Kept as a declaration against 7D5's drawer group (Amendment H1) and placed by nothing here.
    // Pinned at the one site that names it, because the constant surviving with no caller is
    // exactly what makes a later reader reach for it.
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
