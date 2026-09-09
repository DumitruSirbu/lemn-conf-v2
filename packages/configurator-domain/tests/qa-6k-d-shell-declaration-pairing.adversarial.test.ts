// Adversarial QA for wave 6K-d step 4 — **the pairing, at every declared depth and over the seeded
// rows as well as the insertable ones.**
//
// `catalog.test.ts` gained the right claim this wave: a `recorded-shell` row's `frameDepthMm` is its
// nominal *less what its builder puts in front of it*. Two things it does not reach, and both are
// the shape this file exists to attack:
//
//  - **It runs at one depth.** `INSERTABLE_BODY_DEFINITIONS` is
//    `buildInsertableBodyDefinitions(WORKTOP_DEPTH_MM)`, so the gate is 600 mm only — which is
//    exactly "the two agree by coincidence at 600" as a live possibility rather than a worry.
//  - **It reaches no seeded row.** `wall-2door-600`, the four tops, the two pinned tops and the two
//    corner returns carry no `nominalDepthMm` (they are map entries, not `InsertableBody`s), so the
//    predicate skips them. They are the rows `setCabinetDepth`'s `reseat` arm re-measures and the
//    rows `resolveRebuildBody` swaps for the parameterised ones step 4 moved.
//
// **The right-hand side is not the entry's own arithmetic.** A row's finished depth is declared by
// its declarations: cabinetry reads the wall map at the setting, or the cabinet-depth line where a
// lifted column answers it (ADR 0101). So
// `frameDepthMm + frontAssemblyMm` on one side and a declaration that knows nothing about either
// field on the other — the two sources this repository's own note about weak guards asks for.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import type { BodyDefinition } from "../src/void-engine.js";
import { wallCarcassDepthMm } from "../src/catalog.js";
import {
  columnBuildDepthMm,
  declaresALiftedColumnDepth,
} from "../src/cabinet-depth-rule.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";

/** What the row's **declaration** says its finished body fills, asked of the entry's declarations
 *  alone — never of `frameDepthMm`, which is the left-hand side of the identity being checked.
 *
 *  `undefined` for a row this claim does not cover: a manufactured size is a machine's depth and no
 *  `recorded-shell` row declares one, and a row with no rule at all is `cabinetDepthRuleOf`'s
 *  refusal rather than this file's subject.
 *
 *  **Two declarations answer, not one** (ADR 0101 decision 1). A wall row standing over a
 *  full-height column is out of the head-clearance cap's reach, so its finished depth is
 *  `columnBuildDepthMm`'s lifted arm — the cabinet-depth line — and not the map's carcass row. That
 *  is read off `builtDepthFollowsALiftedColumn`, which is where the product states it; inferring it
 *  from a build id or from a suspiciously large `frameDepthMm` is what ADR 0022 forbids.
 *
 *  The `pinned` arm is kept although nothing declares one since ADR 0101 unpinned the deep tops:
 *  without it a future pinned row would fall to `undefined` and be **skipped** by the sweep, which
 *  is a silent hole rather than a refusal. */
function declaredFinishedDepthMm(
  definition: BodyDefinition,
  cabinetDepthMm: number,
): number | undefined {
  const rule = definition.depthRule;
  if (rule === undefined) return undefined;
  if (rule.follows === "pinned") return rule.pinnedFinishedDepthMm;
  if (rule.follows !== "cabinet-depth") return undefined;
  return declaresALiftedColumnDepth(definition)
    ? columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder: true })
    : wallCarcassDepthMm(cabinetDepthMm);
}

interface Row {
  readonly buildId: string;
  readonly frameDepthMm: number;
  readonly frontAssemblyMm: number;
  readonly finishedDepthMm: number;
}

/** Every `recorded-shell` row whose finished depth its own declaration states — seeded and
 *  parameterised together, which is the whole point: a rebuild swaps one for the other. */
function shellRows(cabinetDepthMm: number): readonly Row[] {
  const rows: Row[] = [];
  for (const [buildId, definition] of buildKitchenLBodyCatalog(
    cabinetDepthMm,
  )) {
    const { occupiedDepth } = definition;
    if (occupiedDepth.measuredFrom !== "recorded-shell") continue;
    const finishedDepthMm = declaredFinishedDepthMm(definition, cabinetDepthMm);
    if (finishedDepthMm === undefined) continue;
    rows.push({
      buildId,
      frameDepthMm: definition.frameDepthMm,
      frontAssemblyMm: occupiedDepth.frontAssemblyMm,
      finishedDepthMm,
    });
  }
  return rows;
}

describe("a recorded shell plus its front is the depth its rule declares", () => {
  // Not a vacuous sweep, **and the floor is per arm**. Three arms have to be reached or the sweep
  // certifies the wrong thing: seeded rows, parameterised rows, and — the one `open-shelf` is —
  // a row with **no** front assembly. A sweep landing only on fronted rows would pass with
  // `open-shelf`'s two overrides moved apart.
  it.each(declaredCabinetDepthsMm())(
    "reaches seeded rows, parameterised rows and an unfronted one at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const rows = shellRows(cabinetDepthMm);
      const insertable = rows.filter(
        (row) => catalog.get(row.buildId)?.nominalDepthMm !== undefined,
      );
      const unfronted = rows.filter((row) => row.frontAssemblyMm === 0);
      // **The fourth arm, re-founded by ADR 0101.** It was the pinned rows until 2026-09-07, and it
      // is now the rows a lifted column answers — the ones whose declared depth is the cabinet-depth
      // line rather than the map's. Without one of these in the sweep, `declaredFinishedDepthMm`'s
      // lifted branch is never taken and the file certifies the map arm alone.
      const lifted = [...catalog].filter(([, definition]) =>
        declaresALiftedColumnDepth(definition),
      );

      expect(rows.length).toBeGreaterThan(9);
      expect(insertable.length).toBeGreaterThan(0);
      expect(rows.length).toBeGreaterThan(insertable.length);
      expect(unfronted.length).toBeGreaterThan(1);
      expect(lifted.length).toBeGreaterThan(0);
      expect(rows.length).toBeGreaterThan(lifted.length);
    },
  );

  it.each(declaredCabinetDepthsMm())(
    "holds for every such row at %i mm",
    (cabinetDepthMm) => {
      const disagreeing = shellRows(cabinetDepthMm).filter(
        (row) => row.frameDepthMm + row.frontAssemblyMm !== row.finishedDepthMm,
      );

      expect(disagreeing).toEqual([]);
    },
  );

  // **`open-shelf`'s paired override, as the thing that would break if one half moved.** Both halves
  // are read off the shipped entry rather than restated, so this cannot go stale; what it asserts is
  // that the pair is genuinely a pair — the two numbers are different from the fronted rows' two
  // numbers, in opposite directions, and either one moved alone breaks the identity above.
  it.each(declaredCabinetDepthsMm())(
    "keeps open-shelf's two overrides moving together at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const openShelf = catalog.get("open-shelf");
      const fronted = catalog.get("wall-cabinet");
      if (!openShelf || !fronted) throw new Error("catalogue lost a wall row");
      if (
        openShelf.occupiedDepth.measuredFrom !== "recorded-shell" ||
        fronted.occupiedDepth.measuredFrom !== "recorded-shell"
      ) {
        throw new Error("a wall row stopped recording its shell");
      }

      // The pair, in both fields at once. `open-shelf` has no front, so its frame is the whole
      // finished depth; the fronted row's frame is that less its assembly.
      expect(openShelf.occupiedDepth.frontAssemblyMm).toBe(0);
      expect(openShelf.frameDepthMm).toBe(wallCarcassDepthMm(cabinetDepthMm));
      expect(fronted.occupiedDepth.frontAssemblyMm).toBeGreaterThan(0);
      expect(fronted.frameDepthMm).toBe(
        wallCarcassDepthMm(cabinetDepthMm) -
          fronted.occupiedDepth.frontAssemblyMm,
      );
      // And the two really do differ, so neither assertion above is the other one restated.
      expect(openShelf.frameDepthMm).not.toBe(fronted.frameDepthMm);
    },
  );

  // The predicate the two assertions above rest on, shown to reject. Built from the shipped row with
  // **one** override moved back — the exact edit ADR 0075 decision 1 says must not be made alone —
  // so a future refactor that made the identity unfalsifiable fails here first.
  it("rejects an unfronted row that took the fronted row's shell", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const openShelf = catalog.get("open-shelf");
    const fronted = catalog.get("wall-cabinet");
    if (!openShelf || !fronted) throw new Error("catalogue lost a wall row");
    if (openShelf.occupiedDepth.measuredFrom !== "recorded-shell") {
      throw new Error("open-shelf stopped recording its shell");
    }

    const oneOverrideMoved = {
      buildId: "open-shelf",
      frameDepthMm: fronted.frameDepthMm,
      frontAssemblyMm: openShelf.occupiedDepth.frontAssemblyMm,
      finishedDepthMm: wallCarcassDepthMm(600),
    };
    const theOtherMoved = {
      buildId: "open-shelf",
      frameDepthMm: openShelf.frameDepthMm,
      frontAssemblyMm: 39,
      finishedDepthMm: wallCarcassDepthMm(600),
    };

    for (const row of [oneOverrideMoved, theOtherMoved]) {
      expect(row.frameDepthMm + row.frontAssemblyMm, row.buildId).not.toBe(
        row.finishedDepthMm,
      );
    }
  });
});

// **The seeded rows a depth change actually re-seats.** `reseat` builds a structural body at
// `declaredFrameDepthMm(catalog, record)` and writes twice the measured seat back, so a seeded
// row's declared frame depth is a live input to a stored document rather than a fallback nobody
// reads. These are the four with no `catalogEquivalentId`.
describe("the seeded rows reseat measures", () => {
  it.each(declaredCabinetDepthsMm())(
    "declare a frame depth paired with their front assembly at %i mm",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      const structural = [
        ...new Set(KITCHEN_L_DESIGN.placements.map((p) => p.body.buildId)),
      ].filter(
        (buildId) => catalog.get(buildId)?.catalogEquivalentId === undefined,
      );

      expect(structural).toHaveLength(4);
      const shells = structural
        .map((buildId) => ({ buildId, definition: catalog.get(buildId) }))
        .filter(
          ({ definition }) =>
            definition?.occupiedDepth.measuredFrom === "recorded-shell",
        );
      // Both families reach `reseat`: two wall returns record a shell, two base ones do not.
      expect(shells.length).toBeGreaterThan(0);
      expect(shells.length).toBeLessThan(structural.length);

      for (const { buildId, definition } of shells) {
        if (!definition) throw new Error(`no entry for ${buildId}`);
        if (definition.occupiedDepth.measuredFrom !== "recorded-shell")
          continue;
        expect(
          definition.frameDepthMm + definition.occupiedDepth.frontAssemblyMm,
          buildId,
        ).toBe(declaredFinishedDepthMm(definition, cabinetDepthMm));
      }
    },
  );
});
