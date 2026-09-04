// Wave 6K-b slice 1: a wall body is built to the map row of **the design's own** cabinet depth.
//
// `resolveDepthM` (`commands/insert-fit.ts`) passes `cabinetDepthMm: WORKTOP_DEPTH_MM` to
// `columnBuildDepthM`, so at a 700 mm kitchen every wall body is built to the **600 mm** row. The
// fingerprint is wave 6K-a's measured `A|0.75: 0.3300 -> 0.3690`, where 369 is
// `wallCarcassDepthMm(600) + WALL_FRONT_ASSEMBLY_MM` and the answer the map declares at 700 is
// `wallCarcassDepthMm(700) = 400`. Recorded as ADR 0073's finding and classified there as an
// implementation defect against ADR 0055 decision 1 — no decision needs revising.
//
// **The assertion is on the depth the probe is asked to build at**, which is `fit.plan.depthM` and
// therefore `resolveDepthM`'s own output. A test written against the seat that comes back would be
// measuring the fake probe's model of a builder rather than the rule under test.
import { describe, expect, it } from "vitest";

import { wallCarcassDepthMm } from "../../src/catalog.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { DEFAULT_CABINET_DEPTH_MM } from "../../src/worktop-depth.js";
import {
  deriveColumns,
  derivePlacementRecords,
} from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-04T10:00:00.000Z";
const DEEPER_MM = 700;
/** A wall placement in the seeded kitchen — the band whose depth `resolveDepthM` decides. Every
 *  other band ignores the depth it is handed (ADR 0018). */
const WALL_PLACEMENT_ID = "p8";

function geometryOf(design: Design, cabinetDepthMm: number) {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const records = derivePlacementRecords(design, catalog);
  const columns = deriveColumns(
    records,
    {
      emptyColumns: design.emptyColumns,
      columnExtents: design.columnExtents,
    },
    design.room,
  );
  return { catalog, records, columns };
}

/** The depth the probe was asked to build the inserted wall body at, in millimetres: a delete frees
 *  the opening, an insert fills it, and `fit.plan.depthM` is what reaches the probe. */
function insertedWallDepthMm(cabinetDepthMm: number): number {
  const probe = createFakeProbe({
    catalog: buildKitchenLBodyCatalog(cabinetDepthMm),
  });
  const atDepth =
    cabinetDepthMm === DEFAULT_CABINET_DEPTH_MM
      ? KITCHEN_L_DESIGN
      : requireOk(
          setCabinetDepth({
            design: KITCHEN_L_DESIGN,
            catalogAt: buildKitchenLBodyCatalog,
            cabinetDepthMm,
            probeAt: () => ({ probe, release: () => undefined }),
            occurredAt: OCCURRED_AT,
          }),
        );

  // A swap in place rather than a delete-then-insert: both reach `evaluateInsertFit` through the
  // same `resolveDepthM`, and a swap needs no freed opening, so the fixture's wall run stays whole.
  const world = geometryOf(atDepth, cabinetDepthMm);

  const before = probe.requests.length;
  requireOk(
    insertBody({
      design: atDepth,
      columns: world.columns,
      target: { kind: "placement", id: WALL_PLACEMENT_ID },
      catalog: world.catalog,
      buildId: "wall-cabinet",
      probe,
      occurredAt: OCCURRED_AT,
    }),
  );
  const request = probe.requests[before];
  if (!request) throw new Error("the insert asked the probe for nothing");
  return Math.round(request.depthM * 1000);
}

function requireOk<T extends { ok: boolean }>(
  result: T,
): T extends { ok: true; design: infer D } ? D : never;
function requireOk(result: {
  ok: boolean;
  design: Design;
  reason?: { code: string };
}): Design {
  if (!result.ok) throw new Error(`refused: ${result.reason?.code ?? "?"}`);
  return result.design;
}

describe("the depth a wall body is built to follows the design's own setting", () => {
  // The premise: the map really does declare two different rows, so the assertion below is not
  // comparing a number to itself.
  it("declares a different wall row at each offered depth", () => {
    expect(wallCarcassDepthMm(DEEPER_MM)).not.toBe(
      wallCarcassDepthMm(DEFAULT_CABINET_DEPTH_MM),
    );
  });

  it("builds to the 600 mm row in a 600 mm kitchen", () => {
    expect(insertedWallDepthMm(DEFAULT_CABINET_DEPTH_MM)).toBe(
      wallCarcassDepthMm(DEFAULT_CABINET_DEPTH_MM),
    );
  });

  // **The defect.** A constant here means the row is the 600 one whatever the design carries.
  it("builds to the 700 mm row in a 700 mm kitchen", () => {
    expect(insertedWallDepthMm(DEEPER_MM)).toBe(wallCarcassDepthMm(DEEPER_MM));
  });
});
