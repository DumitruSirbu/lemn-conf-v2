// Adversarial QA for wave 6K-a, at the domain seam its round trip reaches.
//
// 6K-a wires `setCabinetDepth` to the store, so the *second* depth change on one design becomes an
// ordinary thing for a customer to do: try 700, look at it, go back to 600. Every test in
// `set-cabinet-depth.test.ts` changes the depth exactly once, and the two below are what a second
// change measures.
//
// **The assertion is on the depth the probe is asked to build at, not on the seat that comes back.**
// A fake probe is a model of a builder and two of them in this repo model it differently, so a test
// written against the returned seat would be measuring the fake. The request is the command's own
// output either way: `reseat` decides it, and it must be the depth the rebuilt world declares.
import { createBodyProbeLease } from "../../src/body-probe.js";
import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { DEFAULT_CABINET_DEPTH_MM } from "../../src/worktop-depth.js";
import { createFakeProbe } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-04T10:00:00.000Z";
const DEEPER_MM = 700;

/** A structural body — one `resolveRebuildBody` cannot resolve to an insertable equivalent, so it
 *  travels `reseat` rather than `rebuild`. Both bands are here because their catalogue entries are
 *  measured differently (`wall-plane` against `recorded-shell`) and a defect in the depth handed to
 *  the probe shows up in both. */
const STRUCTURAL_BUILD_IDS = [
  "base-corner-x-900",
  "base-corner-return-320",
  "wall-corner-return-570",
  "wall-corner-return-570-top",
] as const;

interface ChangeOutcome {
  readonly design: Design;
  /** What `reseat` asked the probe to build, per structural build id, in whole millimetres. */
  readonly requestedDepthsMm: ReadonlyMap<string, number>;
}

function changeTo(cabinetDepthMm: number, design: Design): ChangeOutcome {
  // The probe is given the catalogue of the depth being moved to, which is the world the real probe
  // would be measuring in. Without it the fake reads the module-scoped 600 mm catalogue and answers
  // every request with the old depth by itself.
  const probe = createFakeProbe({
    catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
  });
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: () => createBodyProbeLease(probe, () => undefined),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const requestedDepthsMm = new Map(
    probe.requests
      .filter((request) =>
        STRUCTURAL_BUILD_IDS.includes(
          request.buildId as (typeof STRUCTURAL_BUILD_IDS)[number],
        ),
      )
      .map((request) => [request.buildId, Math.round(request.depthM * 1000)]),
  );
  return { design: result.design, requestedDepthsMm };
}

/** What the catalogue at a depth says each structural body's frame depth is — the number the probe
 *  should be asked to build at, read off the declaration rather than written out here.
 *
 *  **A joint-seated entry is not among them, by its own declaration** (ADR 0077 decision 1). Since
 *  that ruling `reseat` never measures one: it removes any stored seat and leaves the declaration as
 *  the authority, so the probe is not asked at all. Filtered here rather than removed from
 *  `STRUCTURAL_BUILD_IDS`, so that list stays the full set the *other* assertions sweep and a
 *  future entry changing its rule moves this expectation on its own. */
function declaredDepthsMm(cabinetDepthMm: number): ReadonlyMap<string, number> {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  return new Map(
    STRUCTURAL_BUILD_IDS.filter(
      (buildId) => catalog.get(buildId)?.seatRule?.seatedOn !== "joint",
    ).map((buildId) => {
      const definition = catalog.get(buildId);
      if (!definition) throw new Error(`${buildId} is not in the catalogue`);
      return [buildId, definition.frameDepthMm];
    }),
  );
}

function seatDepthsMm(design: Design): ReadonlyMap<string, number> {
  return new Map(
    design.placements
      .filter((placement) =>
        STRUCTURAL_BUILD_IDS.includes(
          placement.body.buildId as (typeof STRUCTURAL_BUILD_IDS)[number],
        ),
      )
      .map((placement) => [placement.id, placement.body.seatDepthMm ?? -1]),
  );
}

describe("a second cabinet-depth change", () => {
  // The premise, and the reason the first change is not enough to see this: a seeded structural
  // placement carries no `seatDepthMm` at all, so `deriveFrame` falls back to the catalogue and
  // `record.frame.d` really is the new depth. The first change is the only one for which the
  // comment above `reseat` is true.
  it("asks the probe for the new depth on the first change", () => {
    const first = changeTo(DEEPER_MM, KITCHEN_L_DESIGN);

    expect(first.requestedDepthsMm).toEqual(declaredDepthsMm(DEEPER_MM));
  });

  // **The defect.** `reseat` passes `depthM: record.frame.d`, and `deriveFrame` resolves `frame.d`
  // as `placement.body.seatDepthMm ?? definition.frameDepthMm` (ADR 0011 Gap B). Once the first
  // change has written a seat, that `??` takes the stored one, so every later change asks the probe
  // to build the body at the depth it already has and the new catalogue's number is never read.
  it("asks the probe for the new depth on the change after that", () => {
    const first = changeTo(DEEPER_MM, KITCHEN_L_DESIGN);

    const second = changeTo(DEFAULT_CABINET_DEPTH_MM, first.design);

    expect(second.requestedDepthsMm).toEqual(
      declaredDepthsMm(DEFAULT_CABINET_DEPTH_MM),
    );
  });

  // The consequence with a probe whose builder consumes the depth it is handed: the request feeds
  // the next seat, so the error compounds instead of settling. It has no floor — a customer who
  // touches the control often enough walks a corner return down towards nothing, and no guard on
  // the way refuses it, because each individual document is valid.
  it("does not walk a structural body's seat further off on every change", () => {
    const atDefault = changeTo(DEFAULT_CABINET_DEPTH_MM, KITCHEN_L_DESIGN);

    const deeper = changeTo(DEEPER_MM, atDefault.design);
    const backAgain = changeTo(DEFAULT_CABINET_DEPTH_MM, deeper.design);

    expect(seatDepthsMm(backAgain.design)).toEqual(
      seatDepthsMm(atDefault.design),
    );
  });
});
