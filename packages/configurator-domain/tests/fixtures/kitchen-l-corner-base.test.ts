// §11 row 16 — "Corner base | no swap list, no delete, refusal explains why" — reaches the product
// only now. Until ADR 0025 the two base legs of the L were whole-scene geometry with no placement
// behind them, so §6.1's picking (which targets mounted placements) had nothing to select and a
// tap on the corner base did nothing at all: the row was unreachable rather than satisfied.
//
// These tests pin the two halves of that: the legs behave exactly like the wall returns `p9`/`p21`
// that already carried `STRUCTURAL_CORNER`, and adding them changed no derived state anywhere else.
import type { Design } from "../../src/design.js";
import { describe, expect, it } from "vitest";

import {
  baseCarcassFrontMm,
  baseCornerXFrameDepthMm,
  baseFinishedDepthMm,
  isKnownKind,
  kindLabel,
} from "../../src/catalog.js";

import { removePlacement } from "../../src/commands/remove-placement.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { occupiedDepthOfEntryM } from "../../src/occupied-depth.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import {
  deriveColumns,
  derivePlacementRecords,
  recomputeVoids,
  type Column,
  type ColumnExtent,
} from "../../src/void-engine.js";
import { OCCURRED_AT } from "../support/commands.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { createWorld } from "../support/kitchen-world.js";

const CORNER_BASE_IDS = ["p25", "p26"] as const;
const CORNER_RETURN_IDS = ["p9", "p21"] as const;

const seeded = () => createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

/** The `kind` the placement declares — the fact a corner is named by, since it declares no
 *  catalogue equivalent (ADR 0022). */
function cornerKindOf(id: string): string {
  const record = seeded().records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`fixture places no "${id}"`);
  return record.kind;
}

function metaFor(id: string) {
  return describeSelection({
    kitchenSettings: {},
    ...seeded(),
    target: { kind: "placement", id },
  });
}

describe("the base corner is a selectable placement (§11 row 16)", () => {
  it.each(CORNER_BASE_IDS)(
    "%s resolves to a record picking can select",
    (id) => {
      const record = seeded().records.find((candidate) => candidate.id === id);
      expect(record).toBeDefined();
      expect(record?.band).toBe("base");
    },
  );

  /** **`canFinish` is the one capability a corner has, and it is not one §13.1 names.** The ruling of
   *  2026-09-09 gave the corner a colour of its own and moved nothing else: §13.1's list is replace,
   *  delete and width donor, and all three are still refused here. */
  it.each(CORNER_BASE_IDS)("%s offers colour and nothing else", (id) => {
    const meta = metaFor(id);
    expect({
      canReplace: meta?.canReplace,
      canDelete: meta?.canDelete,
      canFinish: meta?.canFinish,
      canHandle: meta?.canHandle,
      canWidth: meta?.canWidth,
      fixedWidth: meta?.fixedWidth,
      structuralReason: meta?.structuralReason,
    }).toEqual({
      canReplace: false,
      canDelete: false,
      canFinish: true,
      canHandle: false,
      canWidth: false,
      fixedWidth: true,
      structuralReason: "corner",
    });
  });

  // The panel's explanation is keyed by `structuralReason`, so the two base legs answering exactly
  // what the two wall returns answer is what makes "behaves the same" a checked claim rather than
  // an eyeballed one.
  it("answers every capability the way the wall corner returns already do", () => {
    const capabilities = (id: string) => {
      const meta = metaFor(id);
      return [
        meta?.canReplace,
        meta?.canDelete,
        meta?.canFinish,
        meta?.canHandle,
        meta?.canWidth,
        meta?.structuralReason,
      ];
    };
    for (const id of CORNER_BASE_IDS) {
      expect([id, capabilities(id)]).toEqual([
        id,
        capabilities(CORNER_RETURN_IDS[0]),
      ]);
    }
  });

  it.each(CORNER_BASE_IDS)("%s has an empty swap list", (id) => {
    const world = seeded();
    expect(offersFor({ ...world, target: { kind: "placement", id } })).toEqual(
      [],
    );
  });

  it.each(CORNER_BASE_IDS)("%s refuses deletion, naming the body", (id) => {
    const world = seeded();
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error(`${id} was deletable`);
    // Narrowed rather than asserted, because the refusal's `params` is a discriminated union and
    // only the `label`-carrying arm is the one §11 row 16 asks to explain the corner by name.
    if (result.reason.code !== "NOT_DELETABLE") {
      throw new Error(`${id} refused with ${result.reason.code}`);
    }
    // The kind the catalogue names a corner by — which is what makes the sentence say *corner*
    // rather than the generic word. The Romanian it resolves to is the catalogue's since 6B-f.
    expect(result.reason.params).toMatchObject({
      label: { kind: "bodyKind" },
    });
    expect(isKnownKind(cornerKindOf(id))).toBe(true);
  });

  it.each(CORNER_BASE_IDS)(
    "%s is named, not left as the generic body",
    (id) => {
      expect(metaFor(id)?.label).toEqual(kindLabel(cornerKindOf(id)));
      expect(isKnownKind(cornerKindOf(id))).toBe(true);
    },
  );
});

/** A column without the one field that is not frozen (`hasFullHeightUnder`), so "unchanged" means
 *  what ADR 0011 Gap D actually freezes: the run's extent. Named field by field rather than dropped
 *  with a rest spread, so a field added to `Column` is a type error here and has to be
 *  classified. */
function extentOf(column: Column | undefined): ColumnExtent | undefined {
  if (!column) return undefined;
  const { key, wall, ry, x, z, w, d, top, regions } = column;
  return { key, wall, ry, x, z, w, d, top, regions };
}

describe("adding the base corner changed no other derived state", () => {
  // The "before" state, reproduced exactly: the same fixture with the two new placements dropped
  // is the design this file's subject was added to. Comparing against it beats a hardcoded
  // snapshot, which would only restate whatever the code currently does.
  const before = createWorld(
    {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !CORNER_BASE_IDS.includes(placement.id as "p25"),
      ),
    },
    KITCHEN_L_BODY_CATALOG,
  );

  it("adds exactly two columns and leaves every pre-existing extent identical", () => {
    const after = seeded();
    const added = [...after.columns.keys()].filter(
      (key) => !before.columns.has(key),
    );
    // B|0.74 → B|0.73 (ADR 0135): the return is centred at 735.
    expect(added.sort()).toEqual(["A|0.45", "B|0.73"]);
    for (const [key, column] of before.columns) {
      expect([key, extentOf(after.columns.get(key))]).toEqual([
        key,
        extentOf(column),
      ]);
    }
  });

  // §7's cap is lifted only by a **full-height** member standing under the opening. `p25` is a base
  // corner, so adding it lifts nothing: the two wall-only columns that overhang it stay capped,
  // before and after. Pinned because the predicate is geometric — it asks about overlap, not column
  // membership — and a version that lifted on "any member underneath" would answer differently here
  // and build a 580 mm carcass over a counter.
  it("leaves the two wall columns that overhang it capped, a base corner lifting nothing", () => {
    const after = seeded();
    for (const key of ["A|0.30", "A|0.75"]) {
      expect([key, before.columns.get(key)?.hasFullHeightUnder]) //
        .toEqual([key, false]);
      expect([key, after.columns.get(key)?.hasFullHeightUnder]) //
        .toEqual([key, false]);
    }
  });

  it("produces no void, before or after", () => {
    expect(before.voids).toEqual([]);
    expect(seeded().voids).toEqual([]);
  });

  // §10's signature flow runs on `p7`/`p24` in column `B|2.45` and never touches a corner. Pinned
  // because a new column that merged into an existing key would move that run's `top`.
  it("leaves the signature flow's column untouched", () => {
    const after = seeded();
    expect(after.columns.get("B|2.45")).toEqual(before.columns.get("B|2.45"));
    expect(
      after.records
        .filter((record) => record.col === "B|2.45")
        .map((record) => record.id)
        .sort(),
    ).toEqual(["p24", "p7"]);
  });

  // Each leg stands alone in its own column, reaching the worktop line and no further, so the
  // column is full and nothing above it is free — which is why no void appears even though the
  // legs are the only members of two brand-new columns.
  it.each([
    ["A|0.45", "p25", 0.9],
    ["B|0.73", "p26", 0.33], // 320 → 330 wide, B|0.74 → B|0.73 (ADR 0135)
  ])("seats %s as a full single-member column", (key, id, widthM) => {
    const column = seeded().columns.get(key);
    expect(column?.regions).toEqual([[0, 0.82]]);
    expect(column?.top).toBe(0.82);
    expect(column?.w).toBeCloseTo(widthM, 6);
    expect(
      seeded()
        .records.filter((record) => record.col === key)
        .map((record) => record.id),
    ).toEqual([id]);
  });
});

describe("the corner legs' seat is the L-joint, not the wall (ADR 0025)", () => {
  const recordFor = (id: string) =>
    derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG).find(
      (record) => record.id === id,
    );

  // The whole point of the ADR, expressed as numbers `buildKitchen()` also produces: the X-leg's
  // carcass is 590 deep but seats 275 mm off the wall, because it must meet the return leg at the
  // joint, z = 0.57 — the return's near edge along its wall, and the base run's carcass front.
  // `frameDepthMm` is the seat, doubled — never a depth. ADR 0135 moved the joint from 0.58 and the
  // leg from 600 deep seated at 280: its back face stays at −0.020, ADR 0025 decision 3's pin, so
  // `KNOWN_WALL_GAP_M` is unchanged. The return's own depth is 570, the joint's number again.
  it("seats the X-leg so its carcass front meets the return leg's near edge", () => {
    const xLeg = recordFor("p25");
    const returnLeg = recordFor("p26");
    // 0.28 → 0.275 (ADR 0135): the leg is built 590 deep and seated at half its 550 frame.
    expect(xLeg?.frame.z).toBeCloseTo(0.275, 9);
    // 0.29 → 0.285: the return is built 570 deep with its back face on the wall.
    expect(returnLeg?.frame.x).toBeCloseTo(0.285, 9);

    const X_LEG_CARCASS_DEPTH_M = 0.59;
    const xLegCarcassFront = (xLeg?.frame.z ?? 0) + X_LEG_CARCASS_DEPTH_M / 2;
    const returnNearEdge =
      (returnLeg?.frame.z ?? 0) - (returnLeg?.frame.w ?? 0) / 2;
    expect(xLegCarcassFront).toBeCloseTo(returnNearEdge, 9);
    expect(xLegCarcassFront).toBeCloseTo(0.57, 9);
    // The back face did not move: ADR 0025 decision 3's pin by value.
    const xLegBackFace = (xLeg?.frame.z ?? 0) - X_LEG_CARCASS_DEPTH_M / 2;
    expect(xLegBackFace).toBeCloseTo(-0.02, 9);
  });

  // Along the wall the two legs butt their neighbours exactly, which is what a gap or an overlap
  // in the corner would show up as first.
  it("butts the base row and the wall-B run with no gap", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const edge = (id: string, side: -1 | 1) => {
      const record = records.find((candidate) => candidate.id === id);
      if (!record) throw new Error(`no record ${id}`);
      const along = record.rotated ? record.frame.z : record.frame.x;
      return along + (side * record.frame.w) / 2;
    };
    expect(edge("p25", 1)).toBeCloseTo(edge("p0", -1), 9); // X-leg -> sink base
    expect(edge("p26", 1)).toBeCloseTo(edge("p5", -1), 9); // return leg -> oven tower
    expect(edge("p25", -1)).toBeCloseTo(0, 9); // the X-leg starts at the corner itself
  });

  it("keeps recompute pure over the enlarged fixture", () => {
    const records = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const columns = deriveColumns(records, {}, KITCHEN_L_DESIGN.room);
    expect(recomputeVoids(records, columns)).toEqual(
      recomputeVoids(records, columns),
    );
  });
});

describe("the base return stands on the run's lines (ADR 0135)", () => {
  const BASE_RETURN_BUILD_ID = "base-corner-return-320";
  const RUN_CARCASS_FRONT_MM_BY_DEPTH = [
    [600, 570],
    [700, 670],
  ] as const;

  it.each(RUN_CARCASS_FRONT_MM_BY_DEPTH)(
    "names the run's carcass front at a %i mm kitchen as %i mm",
    (cabinetDepthMm, carcassFrontMm) => {
      expect(baseCarcassFrontMm(cabinetDepthMm)).toBe(carcassFrontMm);
    },
  );

  it.each(RUN_CARCASS_FRONT_MM_BY_DEPTH)(
    "seats the return on the run's carcass front at a %i mm kitchen",
    (cabinetDepthMm, carcassFrontMm) => {
      const definition =
        buildKitchenLBodyCatalog(cabinetDepthMm).get(BASE_RETURN_BUILD_ID);

      expect(definition?.frameDepthMm).toBe(carcassFrontMm);
    },
  );

  it.each(RUN_CARCASS_FRONT_MM_BY_DEPTH)(
    "finishes the return where a base run does at a %i mm kitchen",
    (cabinetDepthMm) => {
      const definition =
        buildKitchenLBodyCatalog(cabinetDepthMm).get(BASE_RETURN_BUILD_ID);
      if (!definition) throw new Error(`${BASE_RETURN_BUILD_ID} is missing`);

      const finishedMm = Math.round(
        occupiedDepthOfEntryM({ buildId: BASE_RETURN_BUILD_ID, definition }) *
          1000,
      );

      expect(finishedMm).toBe(baseFinishedDepthMm(cabinetDepthMm));
    },
  );
});

describe("the X-leg stands on the run's lines (ADR 0135, the joint move)", () => {
  const X_LEG_BUILD_ID = "base-corner-x-900";
  const X_LEG_FRAME_MM_BY_DEPTH = [
    [600, 550],
    [700, 650],
  ] as const;

  it.each(X_LEG_FRAME_MM_BY_DEPTH)(
    "records the X-leg's seat doubled at a %i mm kitchen as %i mm, its back face staying 20 mm behind the wall",
    (cabinetDepthMm, frameDepthMm) => {
      const definition =
        buildKitchenLBodyCatalog(cabinetDepthMm).get(X_LEG_BUILD_ID);

      expect(baseCornerXFrameDepthMm(cabinetDepthMm)).toBe(frameDepthMm);
      expect(definition?.frameDepthMm).toBe(frameDepthMm);
      // The leg's front is the run's carcass front and its back is 20 mm inside the wall, so its
      // footprint is the front plus 20 and its seat is half the front less 20: 570 and 550/2 at 600.
      expect(baseCarcassFrontMm(cabinetDepthMm) - frameDepthMm).toBe(20);
    },
  );

  it.each(X_LEG_FRAME_MM_BY_DEPTH)(
    "finishes the X-leg where a base run does at a %i mm kitchen",
    (cabinetDepthMm) => {
      const definition =
        buildKitchenLBodyCatalog(cabinetDepthMm).get(X_LEG_BUILD_ID);
      if (!definition) throw new Error(`${X_LEG_BUILD_ID} is missing`);

      const finishedMm = Math.round(
        occupiedDepthOfEntryM({ buildId: X_LEG_BUILD_ID, definition }) * 1000,
      );

      expect(finishedMm).toBe(baseFinishedDepthMm(cabinetDepthMm));
    },
  );

  it("starts the seeded return at the joint, 570 mm, and ends it on the 900 mm reach", () => {
    const placement = KITCHEN_L_DESIGN.placements.find(
      ({ id }) => id === "p26",
    );
    if (!placement) throw new Error("the seeded return is missing");

    expect(placement.body.widthMm).toBe(330);
    expect(placement.alongMm - placement.body.widthMm / 2).toBe(570);
    expect(placement.alongMm + placement.body.widthMm / 2).toBe(900);
  });

  // ADR 0135 accepts that a kitchen stored before the joint moved keeps its 320 mm return, 10 mm short of
  // the X-leg's new front, and shows a slit, with no migration. What must hold is that it still loads:
  // no finding on it at its own depth, and the depth command still takes it to 700.
  describe("a design stored with the return as it was before the joint moved", () => {
    const BEFORE_RETURN_WIDTH_MM = 320;
    const BEFORE_RETURN_CENTRE_MM = 740;
    const stored: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p26"
          ? {
              ...placement,
              alongMm: BEFORE_RETURN_CENTRE_MM,
              body: { ...placement.body, widthMm: BEFORE_RETURN_WIDTH_MM },
            }
          : placement,
      ),
    };

    it("reports no finding at its own depth", () => {
      expect(validateDesignForCatalog(stored, KITCHEN_L_BODY_CATALOG)).toEqual(
        [],
      );
    });

    it("takes the depth command to 700 without refusal or finding", () => {
      const result = setCabinetDepth({
        design: stored,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm: 700,
        probeAt: createFakeProbeFactory(),
        occurredAt: OCCURRED_AT,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        validateDesignForCatalog(result.design, buildKitchenLBodyCatalog(700)),
      ).toEqual([]);
    });
  });
});
