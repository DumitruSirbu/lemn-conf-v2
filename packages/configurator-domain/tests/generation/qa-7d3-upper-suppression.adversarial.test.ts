// Independent adversarial QA for M7 wave 7D3 slice S1 — ADR 0110 Amendment E7's derived upper
// suppression. The slice's own tests read the suppression decision off the same field production
// reads (`nominalHeightMm`); these read it off the **built design** instead, so a rule that names the
// wrong field is a disagreement between two derivations rather than two readings of one number.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  declaredColumnSizes,
  DOOR_BASE_BUILD_ID,
  generateKitchen,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  lShellFloorRuns,
  planKitchenComposition,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "../../src/index.js";
import { isAnUpperOwedOver } from "../../src/generation/upper-policy.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** The wall row's floor (§4's second level), restated so the boundary cannot follow production's constant. */
const WALL_ROW_FLOOR_MM = 1500;
const SWEPT_ROOMS = 150;

/**
 * Every build id a plan can carry into `risesIntoWallRow`, **taken from plans rather than from the
 * tables a plan is built out of**.
 *
 * It was the four priorities plus the leftover rule's storage body when slice S1 wrote this, and
 * enumerating those two constants was then the same set. **7D3's slice S2 made them different**: the
 * tall-end rule composes `tall-oven-tower`, `tall-pantry` and `base-hob-2drawer`, and none of the
 * three is in `GENERATION_PRIORITIES` or is the storage body — so the old derivation went on
 * passing while quietly checking nothing about the bodies the wave had just added. Reading the set
 * off `plan.bases` is the only form that cannot fall behind composition again.
 */
const PLANNABLE_BUILD_IDS: readonly string[] = (() => {
  const columns = declaredColumnSizes(
    buildKitchenLBodyCatalog(cabinetDepthMmOf(KITCHEN_L_DESIGN)),
  );
  const found = new Set<string>();
  // The pre-7A3 approved rectangle, kept on purpose (M7 7A3): its wall-B band produces no new build id.
  for (let widthMm = 900; widthMm <= 6300; widthMm += 7) {
    for (const depthMm of [1000, 1300, 1700, 2500, 3600, 5100]) {
      const room: DesignRoom = { shape: "L", widthMm, depthMm, heightMm: 2600 };
      const plan = planKitchenComposition({
        room,
        runs: lShellFloorRuns(room),
        columns,
      });
      if (!plan.minimumMet) continue;
      for (const base of plan.bases) found.add(base.buildId);
    }
  }
  return [...found];
})();

function generate(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type GeneratedKitchen = Extract<
  ReturnType<typeof generate>,
  { readonly ok: true }
>;

describe("E7's upper suppression reads a field the generated bodies honour", () => {
  // Guards the guard. Both assertions below quantify over `PLANNABLE_BUILD_IDS`, so a derivation that
  // silently narrowed would make them pass while checking less — which is exactly how this file came
  // to stop covering slice S2's three new bodies. The old enumeration is asserted as a **floor** and
  // no longer as the definition, and the bodies that caught it out are named.
  it("derives a plannable set that covers the priorities, the storage body and the block", () => {
    for (const buildId of [
      ...GENERATION_PRIORITIES.map((priority) => priority.buildId),
      // 7D4 S2 renamed the constant and moved its declaration to `body-choice.ts`; the id is the
      // same string and this assertion is unchanged in value.
      DOOR_BASE_BUILD_ID,
      "tall-oven-tower",
      "tall-pantry",
      "base-hob-2drawer",
    ]) {
      expect(PLANNABLE_BUILD_IDS, `${buildId} is plannable`).toContain(buildId);
    }
  });

  // `risesIntoWallRow` throws for a build id whose catalogue entry declares no height, and 22 of the
  // catalogue's 38 rows — every seeded one — declare none. A byte-identical output sweep cannot see
  // this: a room that throws throws in both captures. The throw is unreachable only while every
  // plannable id is an insertable §7 row, and that is what this asserts.
  it("declares a height for every build id a plan can carry, at every declared depth", () => {
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      for (const buildId of PLANNABLE_BUILD_IDS) {
        expect(
          catalog.get(buildId)?.nominalHeightMm,
          `${buildId} at ${String(cabinetDepthMm)} mm`,
        ).toBeGreaterThan(0);
      }
    }
  });

  // §5.2's `h = b.hFlex ? (void.h <= 0.9 ? void.h : b.h) : b.h`: a `heightFlex` body is built to its
  // opening, so its nominal is a default and not its extent — `wall-cabinet` is nominally 700 and is
  // built up to 900 in a tall enough opening. E7's rule reads the nominal, which is only the body's
  // declared top while no plannable body is height-flexible.
  it("plans no height-flexible body, so the nominal is the height the body is built at", () => {
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      for (const buildId of PLANNABLE_BUILD_IDS) {
        expect(
          catalog.get(buildId)?.heightFlex ?? false,
          `${buildId} at ${String(cabinetDepthMm)} mm`,
        ).toBe(false);
      }
    }
  });

  // E7 rules on a **declared top**; production compares a **height**. The two are the same number
  // only for a body standing on the floor, and every planned base does — asserted here over a swept
  // room range rather than read off the one function that hard-codes the zero.
  it("stands every generated base on the floor at its declared height", () => {
    let checkedBases = 0;
    sweepGeneratedKitchens((result) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
      for (const base of generatedBases(result)) {
        checkedBases += 1;
        expect(base.y0Mm).toBe(0);
        expect(base.body.heightMm).toBe(
          catalog.get(base.body.buildId)?.nominalHeightMm,
        );
      }
    });
    expect(checkedBases).toBeGreaterThan(0);
  });
});

describe("E7's upper suppression matches the kitchen that was built", () => {
  // The independent derivation: suppression decided from `y0Mm + heightMm` on the placed body,
  // against the wall row floor the design itself reports.
  it("suppresses an upper exactly above a placed base whose built top crosses the wall row", () => {
    let suppressedBases = 0;
    sweepGeneratedKitchens((result) => {
      const wallRowFloorMm = observedWallRowFloorMm(result.design);
      const mismatched: string[] = [];
      for (const planned of result.log.plan.bases) {
        const base = placedBaseOf(result, planned.id);
        if (!base) continue;
        const crossesWallRow = base.y0Mm + base.body.heightMm > wallRowFloorMm;
        if (crossesWallRow) suppressedBases += 1;
        if (crossesWallRow === hasUpperStep(result, planned.id)) {
          mismatched.push(planned.id);
        }
      }
      expect(mismatched).toEqual([]);
    });
    // Without this the assertion above holds in a sweep that never plans a body reaching the row.
    expect(suppressedBases).toBeGreaterThan(0);
  });

  // The geometric half, derived from built extents rather than from the catalogue: nothing standing
  // in the wall row may share a wall interval with a body that occupies that row.
  it("places no upper inside the footprint of a body that reaches into the wall row", () => {
    sweepGeneratedKitchens((result) => {
      const wallRowFloorMm = observedWallRowFloorMm(result.design);
      const generated = generatedPlacements(result);
      const reachingIn = generated.filter(
        (placement) =>
          placement.y0Mm < wallRowFloorMm &&
          placement.y0Mm + placement.body.heightMm > wallRowFloorMm,
      );
      const intruding = generated
        .filter((placement) => placement.y0Mm >= wallRowFloorMm)
        .filter((upper) =>
          reachingIn.some(
            (body) =>
              body.wall === upper.wall && overlapsAlongWall(body, upper),
          ),
        )
        .map((upper) => upper.id);

      expect(intruding).toEqual([]);
    });
  });

  // **The direction equality must take, witnessed on a body that is actually built.** No catalogue
  // row declares a height of exactly 1500, so no generated kitchen visits E7's boundary at the wall
  // row — but the shell's wall corner return stands the same case one row up: its top is exactly the
  // next row's floor, and the row above it is occupied. A body finishing flush with a row's floor
  // therefore leaves that row free, which is why E7's *at or below* is a strict `>` on the
  // suppression side (ADR 0083 decision 3, *"equality fits"*).
  it("treats a body finishing flush with a row's floor as leaving that row free", () => {
    const result = generate(KITCHEN_L_DESIGN.room);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flushPairs = result.design.placements.flatMap((below) =>
      result.design.placements
        .filter(
          (above) =>
            above.wall === below.wall &&
            above.y0Mm === below.y0Mm + below.body.heightMm &&
            overlapsAlongWall(below, above),
        )
        .map((above) => `${below.id}->${above.id}`),
    );

    expect(flushPairs.length).toBeGreaterThan(0);
  });

  // The boundary itself, which no shipped row stands on: a catalogue whose base declares a top of exactly the
  // wall row's floor is owed an upper, and one a millimetre taller is not.
  it.each([
    [WALL_ROW_FLOOR_MM - 1, true],
    [WALL_ROW_FLOOR_MM, true],
    [WALL_ROW_FLOOR_MM + 1, false],
  ])(
    "rules an upper over a body declaring a top of %i mm: %s",
    (declaredTopMm, isOwed) => {
      const catalog = buildKitchenLBodyCatalog(600);
      const base = catalog.get("base-cabinet");
      if (!base) throw new Error("base-cabinet left the catalogue");
      const declaringThatTop = new Map([
        ...catalog,
        ["base-cabinet", { ...base, nominalHeightMm: declaredTopMm }],
      ]);

      expect(
        isAnUpperOwedOver(
          {
            id: "declared-base",
            role: "storage",
            buildId: "base-cabinet",
            widthMm: 600,
            wall: "A",
            startMm: 900,
            endMm: 1500,
          },
          { room: KITCHEN_L_DESIGN.room, catalog: declaringThatTop },
        ),
      ).toBe(isOwed);
    },
  );
});

function sweepGeneratedKitchens(
  check: (result: GeneratedKitchen) => void,
): void {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (!l) throw new Error("the approved policy declares no L shape");
  fc.assert(
    fc.property(
      fc.record({
        shape: fc.constant("L" as const),
        widthMm: fc.integer({ min: l.wallA.minMm, max: l.wallA.maxMm }),
        depthMm: fc.integer({ min: l.wallB.minMm, max: l.wallB.maxMm }),
        heightMm: fc.integer({ min: 2200, max: 3900 }),
      }),
      (room) => {
        const result = generate(room);
        if (!result.ok) return;
        check(result);
      },
    ),
    { numRuns: SWEPT_ROOMS },
  );
}

/** The placements this generation created, which excludes the shell's own corner bodies — those are
 *  seeded rows carrying no declared height and no plan entry. */
function generatedPlacements(
  result: GeneratedKitchen,
): readonly DesignPlacement[] {
  const placementIds = new Set(
    result.log.steps.flatMap((step) =>
      step.status === "placed" ? [step.placementId] : [],
    ),
  );
  return result.design.placements.filter((placement) =>
    placementIds.has(placement.id),
  );
}

function generatedBases(result: GeneratedKitchen): readonly DesignPlacement[] {
  const baseIds = new Set(result.log.plan.bases.map((base) => base.id));
  const placementIds = new Set(
    result.log.steps.flatMap((step) =>
      step.status === "placed" && baseIds.has(step.id)
        ? [step.placementId]
        : [],
    ),
  );
  return result.design.placements.filter((placement) =>
    placementIds.has(placement.id),
  );
}

function placedBaseOf(
  result: GeneratedKitchen,
  plannedId: string,
): DesignPlacement | undefined {
  const step = result.log.steps.find(
    (candidate) => candidate.id === plannedId && candidate.status === "placed",
  );
  if (!step || step.status !== "placed") return undefined;
  return result.design.placements.find(
    (placement) => placement.id === step.placementId,
  );
}

function hasUpperStep(result: GeneratedKitchen, plannedId: string): boolean {
  return result.log.steps.some(
    (step) =>
      step.id === `upper:${plannedId}` || step.id === `hood:${plannedId}`,
  );
}

/** The wall row's floor as the built design reports it — the lowest row standing off the floor —
 *  rather than the constant production compares against. */
function observedWallRowFloorMm(design: Design): number {
  const raisedMm = design.placements
    .map((placement) => placement.y0Mm)
    .filter((y0Mm) => y0Mm > 0);
  if (raisedMm.length === 0) {
    throw new Error("the generated design stands nothing off the floor");
  }
  return Math.min(...raisedMm);
}

function overlapsAlongWall(
  left: DesignPlacement,
  right: DesignPlacement,
): boolean {
  const leftStartMm = left.alongMm - left.body.widthMm / 2;
  const leftEndMm = left.alongMm + left.body.widthMm / 2;
  const rightStartMm = right.alongMm - right.body.widthMm / 2;
  const rightEndMm = right.alongMm + right.body.widthMm / 2;
  return leftStartMm < rightEndMm && rightStartMm < leftEndMm;
}
