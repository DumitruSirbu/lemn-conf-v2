// **A column's back face is on the wall plane** — the invariant, and the incident that established
// it. Wave 5F moved `column.d` to the occupied depth (ADR 0036, ADR 0039) and left `column.x`/`z`
// on the deepest member's raw seat. Those had been the same fact while every body was seated
// back-to-the-plane, so nothing said they were two.
//
// Measured then: six of eleven columns started off the plane — five fronted ones at −19.5 mm and
// `A|2.60` at **+50**, because the hood was still its deepest member. `recomputeVoids` stamps both
// numbers onto every void and `buildVoidMesh` draws them, so a single delete showed it.
//
// **Fixed in `71661d6`**: the coordinate is derived as `depth / 2`, so no member's deliberate
// offset — ADR 0025's corner leg 20 mm inside the wall, ADR 0039's hood 100 mm off it — travels
// into the column that holds it. These tests are the invariant, not a bug report; they pass.
import {
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  occupiedDepthM,
  recomputeVoids,
  removePlacement,
  toMillimetres,
  type Column,
  type Design,
  type VoidRecord,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const OCCURRED_AT = "2026-08-30T12:00:00.000Z";

/** The seeded room puts both wall planes at 0, which the decomposition parity gate asserts against
 *  the reference meshes. Stated here rather than imported so this file does not depend on the
 *  adapter to know where the wall is. */
const WALL_PLANE_M = 0;

/** The coordinate a column publishes along its wall's normal — the axis a depth is measured on.
 *  Wall A bodies run along `x` and are seated in `z`; wall B is the transpose. */
function normalCoordinateM(column: Column): number {
  return column.wall === "A" ? column.z : column.x;
}

function voidNormalCoordinateM(record: VoidRecord): number {
  return record.wall === "A" ? record.z : record.x;
}

function loadColumns() {
  const records = derivePlacementRecords(
    KITCHEN_L_DESIGN,
    KITCHEN_L_BODY_CATALOG,
  );
  return { records, columns: deriveColumns(records) };
}

function withoutPlacement(design: Design, placementId: string): Design {
  const result = removePlacement({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: placementId },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Could not remove ${placementId}: ${result.reason.code}`);
  }
  return result.design;
}

/** The voids §4 derives for one column once `placementId` is gone — the ones §6.1 renders. Column
 *  extents are frozen at load (ADR 0011 Gap D), so the deletion re-derives records against the
 *  columns the seeded design produced. */
function voidsAfterDeleting(placementId: string, columnKey: string) {
  const { columns } = loadColumns();
  const records = derivePlacementRecords(
    withoutPlacement(KITCHEN_L_DESIGN, placementId),
    KITCHEN_L_BODY_CATALOG,
  );
  return recomputeVoids(records, columns).filter(
    (record) => record.col === columnKey,
  );
}

describe("a column's extent starts at its wall plane", () => {
  // Every column, not a hand-picked one: the defect this closes is that whether a column is
  // affected depends on which of its members happens to be deepest, which is not a property anyone
  // reading `deriveColumns` would predict.
  it("seats every column's depth on the wall plane", () => {
    const { columns } = loadColumns();
    const offWallMm: Record<string, number> = {};

    for (const column of columns.values()) {
      const backFaceMm = toMillimetres(
        normalCoordinateM(column) - column.d / 2 - WALL_PLANE_M,
      );
      if (backFaceMm !== 0) offWallMm[column.key] = backFaceMm;
    }

    // Named rather than counted: which columns are affected is a function of which member happens
    // to be deepest, so the list is the finding.
    expect(offWallMm).toEqual({});
  });

  // The guard against the test above going vacuous by agreeing for the wrong reason: the column's
  // published depth really is the occupied depth of its deepest member, so the coordinate is the
  // only free variable in the identity.
  it("publishes the deepest member's occupied depth as the column depth", () => {
    const { records, columns } = loadColumns();

    for (const column of columns.values()) {
      const members = records.filter((record) => record.col === column.key);
      expect(column.d, column.key).toBeCloseTo(
        Math.max(...members.map(occupiedDepthM)),
        9,
      );
    }
  });
});

describe("§6.1's rendered void box lies in the run it belongs to", () => {
  // One tap each from the shipped kitchen. `buildVoidMesh` centres the box on the void's `x`/`z`
  // and sizes it by `d`, so these are the numbers a person sees.
  it.each([
    { deleted: "p13", column: "A|2.60", what: "the hood" },
    {
      deleted: "p8",
      column: "A|0.30",
      what: "a fronted wall cabinet on wall A",
    },
    { deleted: "p22", column: "B|1.20", what: "a deep top cabinet on wall B" },
  ])(
    "puts the void back on the wall after deleting $what",
    ({ deleted, column }) => {
      const voids = voidsAfterDeleting(deleted, column);
      expect(voids.length).toBeGreaterThan(0);

      for (const record of voids) {
        const backFaceMm = toMillimetres(
          voidNormalCoordinateM(record) - record.d / 2 - WALL_PLANE_M,
        );
        expect(backFaceMm, `${record.id}: back face`).toBe(0);
      }
    },
  );
});
