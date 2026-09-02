// M6 wave 6H: **the cabinet depth is a parameter, not a module constant.**
//
// The wave's hard gate is that parameterising moves nothing — the same bar wave 5F cleared — so the
// 600 mm build is checked against a table of today's shipped numbers **written here as data**. A
// test that reads the values it is checking out of the module it checks proves nothing, which is
// the stance `worktop-depth.test.ts` already takes about the depth map's own rows.
//
// The second half is the falsifiable one ADR 0036 decision 5 asks for: a catalogue built at 700
// describes a *different* kitchen, and it must, or the control wave 6J ships would be a no-op.
import { describe, expect, it } from "vitest";

import {
  buildInsertableBodyDefinitions,
  INSERTABLE_BODY_DEFINITIONS,
  type CatalogEntry,
} from "../src/catalog.js";
import { wallCarcassMaxDepthOverWorktopM } from "../src/commands/insert-fit.js";
import { toMillimetres } from "../src/millimetres.js";
import type { BodyDefinition } from "../src/void-engine.js";
import {
  declaredWorktopDepthsMm,
  UnknownWorktopDepthError,
  wallDepthMmForWorktop,
  WORKTOP_DEPTH_MM,
} from "../src/worktop-depth.js";

/** The two depths ADR 0036 decision 3 declares. Read from the map so a third row added later is
 *  swept rather than silently skipped, and asserted to be the pair the owner decided. */
const DECLARED_DEPTHS_MM = declaredWorktopDepthsMm();

/** ADR 0039 decision 1: *"hood is always standard"* — the one body the depth map does not reach. */
const HOOD_BODY_DEPTH_MM = 500;

/** Every depth-bearing field of the shipped catalogue, as it stands **before** this wave: the
 *  entry's nominal, the `frameDepthMm` fallback `void-engine.ts` seats an unmeasured placement
 *  from, and the finished depth its `occupiedDepth` rule declares (or the front assembly, for the
 *  wall carcasses whose depth is a placement variable).
 *
 *  Transcribed from the built catalogue on 2026-09-02, at the declared 600 mm. Not one of these
 *  numbers may move: M1's parity gate diffs the geometry these drive at 1e-6 m, and exact equality
 *  here is the stricter statement of the same thing — a millimetre is a thousand times that
 *  tolerance. */
const SHIPPED_AT_600: readonly (readonly [
  string,
  number,
  number,
  Record<string, unknown>,
])[] = [
  ["base-cabinet", 580, 580, wallPlane(620)],
  ["base-3drawer", 580, 580, wallPlane(620)],
  ["base-panbank", 580, 580, wallPlane(620)],
  ["base-hob-2drawer", 580, 580, wallPlane(620)],
  ["base-hob-oven", 580, 580, wallPlane(648)],
  ["base-bottle-cargo", 580, 580, wallPlane(620)],
  ["base-sink", 580, 580, wallPlane(620)],
  ["base-dishwasher", 580, 580, wallPlane(620)],
  ["wall-cabinet", 330, 330, recordedShell(39)],
  ["wall-lift", 330, 330, recordedShell(39)],
  ["open-shelf", 330, 330, recordedShell(0)],
  ["hood", 500, 700, wallPlane(600)],
  ["tall-pantry", 560, 560, wallPlane(599)],
  ["tall-oven-tower", 560, 560, wallPlane(638)],
  ["tall-fridge-housing", 560, 560, wallPlane(599)],
  ["fridge-free", 680, 680, wallPlane(742)],
];

function wallPlane(finishedDepthMm: number) {
  return { measuredFrom: "wall-plane", finishedDepthMm };
}

function recordedShell(frontAssemblyMm: number) {
  return { measuredFrom: "recorded-shell", frontAssemblyMm };
}

function depthFactsOf(
  entries: readonly CatalogEntry[],
): (readonly [string, number | undefined, number | undefined, unknown])[] {
  return entries.map(([buildId, definition]) => [
    buildId,
    definition.nominalDepthMm,
    definition.frameDepthMm,
    definition.occupiedDepth,
  ]);
}

function entryAt(cabinetDepthMm: number, buildId: string): BodyDefinition {
  const found = buildInsertableBodyDefinitions(cabinetDepthMm).find(
    ([id]) => id === buildId,
  );
  if (!found) throw new Error(`no catalogue entry "${buildId}"`);
  return found[1];
}

/** The finished depth a `wall-plane` entry declares. Throws for the other rule rather than
 *  returning a placeholder: a sweep that quietly skipped a body would be the vacuous assertion. */
function finishedDepthMmOf(definition: BodyDefinition): number {
  const rule = definition.occupiedDepth;
  if (rule.measuredFrom !== "wall-plane") {
    throw new Error("entry declares no wall-plane finished depth");
  }
  return rule.finishedDepthMm;
}

describe("the shipped catalogue is the 600 mm build, to the millimetre", () => {
  it("declares the two depths the owner decided, and no interpolated third", () => {
    expect(DECLARED_DEPTHS_MM).toEqual([600, 700]);
    expect(WORKTOP_DEPTH_MM).toBe(600);
  });

  it("reproduces every depth-bearing field the catalogue shipped with", () => {
    expect(depthFactsOf(buildInsertableBodyDefinitions(600))).toEqual(
      SHIPPED_AT_600,
    );
  });

  it("is what the module-level catalogue every reader still uses is built from", () => {
    expect(INSERTABLE_BODY_DEFINITIONS).toEqual(
      buildInsertableBodyDefinitions(WORKTOP_DEPTH_MM),
    );
  });

  it("caps a wall carcass at the same map row it always did", () => {
    expect(toMillimetres(wallCarcassMaxDepthOverWorktopM(600))).toBe(330);
  });
});

describe("a catalogue built at 700 describes a different kitchen", () => {
  // ADR 0036 decision 5: changing the setting adapts every cabinet, with nothing left behind. The
  // falsifiable form of "no module-level constant fixes these at 600" is that the same build
  // function, given 700, answers differently — a constant cannot.
  it("moves a wall entry's nominal depth to the map's second row", () => {
    expect(entryAt(600, "wall-cabinet").nominalDepthMm).toBe(330);
    expect(entryAt(700, "wall-cabinet").nominalDepthMm).toBe(400);
    expect(entryAt(700, "wall-cabinet").nominalDepthMm).toBe(
      wallDepthMmForWorktop(700),
    );
  });

  it("moves a base entry's occupied depth by the depth it was given", () => {
    expect(finishedDepthMmOf(entryAt(600, "base-cabinet"))).toBe(620);
    expect(finishedDepthMmOf(entryAt(700, "base-cabinet"))).toBe(720);
  });

  it("moves the head-clearance cap with the catalogue's nominal, at both depths", () => {
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(
        toMillimetres(wallCarcassMaxDepthOverWorktopM(cabinetDepthMm)),
      ).toBe(entryAt(cabinetDepthMm, "wall-cabinet").nominalDepthMm);
    }
  });

  it("moves every wall entry's nominal, not only the one the map is named after", () => {
    for (const buildId of ["wall-cabinet", "wall-lift", "open-shelf"]) {
      expect(entryAt(700, buildId).nominalDepthMm).not.toBe(
        entryAt(600, buildId).nominalDepthMm,
      );
    }
  });

  // **A gap this wave records rather than closes, and it is wave 6I's by name.** A base entry's
  // `nominalDepthMm` is the literal `BASE_DEPTH_MM` (580) — the seat `void-engine.ts` falls back to
  // — and it does not follow the setting, while the *finished* depth above does. So a catalogue
  // built at 700 currently declares a base body that finishes at 720 on a 580 mm seat.
  //
  // Not repaired here: 6H's punch list is the five depth-derived facts, and 6I's criterion is that
  // *every base-band body's finished depth moves by the same amount the formula moves*
  // `baseCabinet` *by, asserted per body against the built meshes*. Stated as an assertion so the
  // gap is a number somebody read; **6I is expected to change this line**, which is the point.
  it("still carries the base seat as a literal — wave 6I's carry-out, stated", () => {
    expect(entryAt(600, "base-cabinet").nominalDepthMm).toBe(580);
    expect(entryAt(700, "base-cabinet").nominalDepthMm).toBe(580);
  });
});

describe("an undeclared cabinet depth refuses to build a catalogue at all", () => {
  // ADR 0028 decision 4, carried through the parameterisation rather than softened by it: wall
  // depths are manufactured sizes, so a missing row is a programming error. 650 would interpolate
  // to 372 and 800 would extrapolate to 500 — a plausible future row, and deliberately not a
  // commitment. A half-built catalogue at an undeclared depth is worse than no catalogue.
  it.each([650, 800, 620, 0, -600, 599.9, Number.NaN])(
    "throws for %p rather than interpolating, rounding or defaulting",
    (cabinetDepthMm) => {
      expect(() => buildInsertableBodyDefinitions(cabinetDepthMm)).toThrow(
        UnknownWorktopDepthError,
      );
    },
  );

  it("names the depth it was given, so the refusal is diagnosable", () => {
    expect(() => buildInsertableBodyDefinitions(650)).toThrow(/650 mm/);
  });

  it("only ever builds wall entries at a depth the map declares", () => {
    const declaredWallDepthsMm = DECLARED_DEPTHS_MM.map((depthMm) =>
      wallDepthMmForWorktop(depthMm),
    );
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(declaredWallDepthsMm).toContain(
        entryAt(cabinetDepthMm, "wall-cabinet").nominalDepthMm,
      );
    }
  });
});

describe("the hood's finished line follows the setting and its body does not", () => {
  // ADR 0039 decisions 1 and 2, asserted at **both** depths so the growing gap cannot later be
  // "fixed" by putting the hood back on the depth map. A hood is a manufactured appliance sized to
  // the cooktop it covers, hung at the front; the space behind it is what the chimney hides.
  it.each([
    { cabinetDepthMm: 600, concealedGapMm: 100 },
    { cabinetDepthMm: 700, concealedGapMm: 200 },
  ])(
    "keeps a 500 mm hood at $cabinetDepthMm mm and hides a $concealedGapMm mm gap behind it",
    ({ cabinetDepthMm, concealedGapMm }) => {
      const hood = entryAt(cabinetDepthMm, "hood");

      expect(hood.nominalDepthMm).toBe(HOOD_BODY_DEPTH_MM);
      expect(finishedDepthMmOf(hood)).toBe(cabinetDepthMm);
      expect(finishedDepthMmOf(hood) - HOOD_BODY_DEPTH_MM).toBe(concealedGapMm);
    },
  );

  it("never gives the hood the wall map's depth, at either declared depth", () => {
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(entryAt(cabinetDepthMm, "hood").nominalDepthMm).not.toBe(
        wallDepthMmForWorktop(cabinetDepthMm),
      );
    }
  });

  it("seats it from the front at both depths, as twice its rear overhang", () => {
    // ADR 0018: `frameDepthMm` is not a depth. §11 row 19's second named exception.
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(entryAt(cabinetDepthMm, "hood").frameDepthMm).toBe(
        2 * cabinetDepthMm - HOOD_BODY_DEPTH_MM,
      );
    }
  });
});
