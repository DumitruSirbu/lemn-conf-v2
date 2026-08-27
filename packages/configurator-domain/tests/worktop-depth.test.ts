// The single-source gate: §7's `nominalDepthMm` for every wall entry and §5.2's head-clearance cap
// are the *same* number, read from the worktop → wall depth map.
//
// This is the criterion M5 wave 5A exists for. The defect was not a wrong number — it was two
// numbers: `catalog.ts`'s `WALL_DEPTH_MM` and `insert-fit.ts`'s
// `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M` were independent literals that happened to agree at 400,
// so the seeded kitchen could be authored at 330 with every gate green. The assertions below fail
// if a future edit moves one without the other.
import { describe, expect, it } from "vitest";

import { INSERTABLE_BODY_DEFINITIONS } from "../src/catalog.js";
import { toMillimetres } from "../src/millimetres.js";
import { WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M } from "../src/commands/insert-fit.js";
import {
  declaredWorktopDepthsMm,
  UnknownWorktopDepthError,
  wallDepthMmForWorktop,
  WORKTOP_DEPTH_MM,
} from "../src/worktop-depth.js";

/** The map's shipped rows, restated as data rather than read out of the module under test — a test
 *  that reads the number it is checking out of the code it checks proves nothing. `800 -> 500` is
 *  deliberately absent: it is a plausible future row and not a commitment. */
const DECLARED_ROWS: readonly (readonly [number, number])[] = [
  [600, 330],
  [700, 400],
];

/** §7's wall entries whose depth the map governs. The hood is not among them: `HOOD_DEPTH_MM` is
 *  500 and whether a hood follows the worktop is an open question (`M5-width.md`, *Not
 *  established*). Listed by id rather than filtered by depth, so an entry that silently stopped
 *  reading the map cannot drop out of the sweep. */
const WALL_ENTRY_IDS = ["wall-2door", "wall-1door", "wall-lift", "open-shelf"];

const HOOD_DEPTH_MM = 500;

describe("the worktop → wall depth map", () => {
  it("declares exactly the rows the owner decided, and no interpolated third", () => {
    expect(declaredWorktopDepthsMm()).toEqual(
      DECLARED_ROWS.map(([worktopDepthMm]) => worktopDepthMm),
    );
  });

  it.each(DECLARED_ROWS)(
    "maps a %i mm worktop to a %i mm wall",
    (worktopDepthMm, wallDepthMm) => {
      expect(wallDepthMmForWorktop(worktopDepthMm)).toBe(wallDepthMm);
    },
  );

  it("ships the worktop at 600 mm, which is the only row M5 can reach", () => {
    expect(WORKTOP_DEPTH_MM).toBe(600);
  });
});

describe("an undeclared worktop depth fails loudly", () => {
  // Decision 4: wall depths are manufactured sizes. A formula would invent a 372 mm cabinet nobody
  // makes, so a missing row is a programming error and never a number to guess at.
  it.each([650, 800, 0, -600, 599.9, Number.NaN])(
    "refuses %p rather than interpolating, rounding or defaulting",
    (worktopDepthMm) => {
      expect(() => wallDepthMmForWorktop(worktopDepthMm)).toThrow(
        UnknownWorktopDepthError,
      );
    },
  );

  it("names the value it was given, so the refusal is diagnosable", () => {
    expect(() => wallDepthMmForWorktop(650)).toThrow(/650 mm/);
  });
});

describe("the map is the single source for both of §7's and §5.2's numbers", () => {
  const expectedWallDepthMm = wallDepthMmForWorktop(WORKTOP_DEPTH_MM);

  it("is reached at all — the sweep names four wall entries and finds them", () => {
    // Guards the sweep against going vacuous: a renamed id would otherwise assert nothing.
    const found = INSERTABLE_BODY_DEFINITIONS.filter(([buildId]) =>
      WALL_ENTRY_IDS.includes(buildId),
    );
    expect(found).toHaveLength(WALL_ENTRY_IDS.length);
  });

  it.each(WALL_ENTRY_IDS)(
    "%s takes its nominal depth from the map row, not from a literal",
    (wallEntryId) => {
      const entry = INSERTABLE_BODY_DEFINITIONS.find(
        ([buildId]) => buildId === wallEntryId,
      );
      expect(entry?.[1].nominalDepthMm).toBe(expectedWallDepthMm);
    },
  );

  it("caps a wall carcass over a worktop at the same map row", () => {
    expect(toMillimetres(WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M)).toBe(
      expectedWallDepthMm,
    );
  });

  it("moves both numbers to 330 at the shipped worktop, and neither to 400", () => {
    // The defect as the customer sees it, stated as the two numbers rather than as a built body:
    // 400 is what a re-inserted top-row cabinet was built to beside 330 mm neighbours.
    expect(expectedWallDepthMm).toBe(330);
    expect(
      INSERTABLE_BODY_DEFINITIONS.filter(([buildId]) =>
        WALL_ENTRY_IDS.includes(buildId),
      ).map(([, definition]) => definition.nominalDepthMm),
    ).toEqual([330, 330, 330, 330]);
    expect(toMillimetres(WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M)).not.toBe(400);
  });

  it("leaves the hood's 500 mm alone on both depth fields, because that question is not decided", () => {
    // `nominalDepthMm` alone is not enough, and this assertion checked only that until QA finding
    // Q1.1: the entry is spread from `wallCabinet(...)`, so `frameDepthMm` was inherited from the
    // map-governed `WALL_DEPTH_MM` while the nominal said 500. `void-engine.ts` reads
    // `frameDepthMm` as the fallback for a placement with no measured `seatDepthMm`, so the field
    // this test skipped is the one that decided the depth.
    const hood = INSERTABLE_BODY_DEFINITIONS.find(
      ([buildId]) => buildId === "hood",
    );
    expect(hood?.[1].nominalDepthMm).toBe(HOOD_DEPTH_MM);
    expect(hood?.[1].frameDepthMm).toBe(HOOD_DEPTH_MM);
  });
});
