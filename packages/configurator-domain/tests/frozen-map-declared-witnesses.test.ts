// ADR 0080 Amendments A and C, held by DECLARED WITNESSES (ADR 0123): the fallback's equality at a column
// whose `hasFullHeightUnder` is true, over a legacy extent with no recorded source.
//
// **The state is constructed, and no product path reaches it.** A column's `hasFullHeightUnder` is true only
// where a full-height member's span overlaps the column's by a positive length (`overlapsAlongWall`, M7-FB-013,
// ADR 0123), and a member-less column sits beside the members of its run, abutting them. A pantry inserted
// next to the member-less dishwasher slot fills [900, 1700] against the slot's [1700, 2300], so the slot reads
// false (`apps/web/tests/store/qa-6k-j-fallback-rule.adversarial.test.ts` pins it). The rule still has the arm:
// a member-less column whose predicate is true at the setting being left or at the new one, which these call
// directly with legacy depths.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { columnBuildDepthM } from "../src/cabinet-depth-rule.js";
import type { DesignRoom } from "../src/design.js";
import { buildKitchenLBodyCatalog } from "../src/fixtures/kitchen-l-design.js";
import { frozenMapAtCabinetDepth } from "../src/frozen-map-at-cabinet-depth.js";
import type { Column } from "../src/void-engine.js";

const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4200,
  depthMm: 2400,
  heightMm: 2600,
};
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const SLOT_ALONG_MM = 2000;
const SLOT_WIDTH_MM = 600;
const CLOSE_TO_MM_DIGITS = 6;

function ceilingMm(
  cabinetDepthMm: number,
  hasFullHeightUnder: boolean,
): number {
  return columnBuildDepthM({ cabinetDepthMm, hasFullHeightUnder }) * 1000;
}

function memberLessLegacyColumn(
  frozenMm: number,
  hasFullHeightUnder: boolean,
): Column {
  return {
    key: "A|2.00",
    wall: "A",
    ry: 0,
    x: SLOT_ALONG_MM / 1000,
    z: 0,
    w: SLOT_WIDTH_MM / 1000,
    d: frozenMm / 1000,
    top: 2.6,
    regions: [[0, 2.6]],
    hasFullHeightUnder,
  };
}

/** The depth, in millimetres, the slot's column carries after the setting moves from `previousMm` to `nowMm`. */
function publishedMm(
  column: Column,
  previousMm: number,
  nowMm: number,
): number {
  const republished = frozenMapAtCabinetDepth({
    frozen: new Map([[column.key, column]]),
    records: [],
    previousRecords: [],
    membersShiftMmByColumn: new Map(),
    room: ROOM,
    catalog: buildKitchenLBodyCatalog(nowMm),
    cabinetDepthMm: nowMm,
    previousCabinetDepthMm: previousMm,
  });
  const [only, ...others] = [...republished.values()];
  if (only === undefined || others.length > 0) {
    throw new Error("the one frozen column did not republish as one column");
  }
  return only.d * 1000;
}

describe("declared witnesses: a member-less legacy column that reads full-height", () => {
  it("deepens rather than follows when the predicate rose since the freeze", () => {
    // A legacy 400 is what the capped arm published at 700; the predicate now reads true, so the ceiling it
    // is leaving is 600, not 400, the equality fails, and the surplus arm's MAX deepens it to 700.
    const column = memberLessLegacyColumn(ceilingMm(DEEP_MM, false), true);

    expect(ceilingMm(SHALLOW_MM, true)).not.toBeCloseTo(
      column.d * 1000,
      CLOSE_TO_MM_DIGITS,
    );
    expect(publishedMm(column, SHALLOW_MM, DEEP_MM)).toBeCloseTo(
      ceilingMm(DEEP_MM, true),
      CLOSE_TO_MM_DIGITS,
    );
    expect(publishedMm(column, SHALLOW_MM, DEEP_MM)).toBeGreaterThan(
      column.d * 1000,
    );
  });

  // Literal millimetres, none read through `columnBuildDepthM`: the 700 setting's lifted ceiling is 700 and the
  // 600 setting's is 600 (seats 661 and 561, which a full-height member lifts, plus the 39 mm of door and handle).
  it.each([
    {
      frozenMm: 700,
      publishedAtShallowMm: 600,
      why: "the ceiling it is leaving, so it follows the setting",
    },
    {
      frozenMm: 620,
      publishedAtShallowMm: 620,
      why: "a surplus above the new ceiling, so it is kept",
    },
    {
      frozenMm: 650,
      publishedAtShallowMm: 650,
      why: "strictly between the two ceilings, so it is kept",
    },
  ])(
    "publishes $publishedAtShallowMm for a frozen $frozenMm going from 700 to 600 under a full-height member: $why",
    ({ frozenMm, publishedAtShallowMm }) => {
      expect(
        publishedMm(
          memberLessLegacyColumn(frozenMm, true),
          DEEP_MM,
          SHALLOW_MM,
        ),
      ).toBeCloseTo(publishedAtShallowMm, CLOSE_TO_MM_DIGITS);
    },
  );

  propertyTest.prop([fc.integer({ min: 500, max: 800 })])(
    "follows the setting only from the ceiling it is leaving, under a full-height member",
    (frozenMm) => {
      const expectedMm =
        frozenMm === ceilingMm(DEEP_MM, true)
          ? ceilingMm(SHALLOW_MM, true)
          : Math.max(frozenMm, ceilingMm(SHALLOW_MM, true));

      expect(
        publishedMm(
          memberLessLegacyColumn(frozenMm, true),
          DEEP_MM,
          SHALLOW_MM,
        ),
      ).toBeCloseTo(expectedMm, CLOSE_TO_MM_DIGITS);
    },
  );
});
