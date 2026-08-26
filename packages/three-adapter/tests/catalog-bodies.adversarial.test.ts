// Adversarial QA for M3 Wave 3B, work item 6. §7 conformance is checked here against the catalogue
// the *domain* actually ships (`INSERTABLE_BODY_DEFINITIONS`), entry by entry and width by width,
// through the gate `insertBody` will apply — `refuseBuiltSize`, which compares the measured carcass
// against the plan with `FIT_TOLERANCE_M` of slack.
//
// The failure this is written to catch is the one ADR 0016 names for the hood and closes: a body
// the panel offers and the engine then refuses. That shape is invisible to a builder test that
// only asserts "a group came back with meshes in it".
import {
  evaluateInsertFit,
  FIT_TOLERANCE_M,
  INSERTABLE_BODY_DEFINITIONS,
  MIN_WIDTH_M,
  toInsertableBody,
  toMetres,
  type BodyDefinition,
  type Column,
  type InsertOpening,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import { measureBuiltBody } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §7's wall-cabinet door rule is `w > 0.45 ? 2 : 1`; §11 row 20 is the 570 mm case. */
const TWO_DOOR_MIN_WIDTH_MM = 450;

/** ADR 0017: the sink aperture's own width. Read from the catalogue below as well, so this constant
 *  is only the number the *reasoning* turns on. */
const SINK_MIN_WIDTH_MM = 560;

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

interface BuiltSize {
  readonly carcassWidthMm: number;
  readonly carcassHeightMm: number;
  readonly fullHeightMm: number;
}

function build(
  buildId: string,
  widthMm: number,
  heightMm: number,
  depthMm: number,
): BuiltSize {
  const measurement = measureBuiltBody({
    kit,
    room,
    request: {
      buildId,
      widthM: toMetres(widthMm),
      heightM: toMetres(heightMm),
      depthM: toMetres(depthMm),
    },
  });
  return {
    carcassWidthMm: 1000 * measurement.carcassWidthM,
    carcassHeightMm: 1000 * measurement.carcassHeightM,
    fullHeightMm: 1000 * measurement.fullHeightM,
  };
}

/** `refuseBuiltSize` in `commands/insert-body.ts`, restated as a predicate so the sweep asserts the
 *  exact gate the engine applies rather than a QA-invented tolerance. */
function passesBuiltSizeGate(builtMm: number, requiredMm: number): boolean {
  return (
    Number.isFinite(builtMm) &&
    Math.abs(toMetres(builtMm) - toMetres(requiredMm)) <= FIT_TOLERANCE_M
  );
}

/** Runs §5.2's pre-probe width guard for one entry against a base opening of the given width, and
 *  returns the refusal code, or `undefined` when the engine would accept it. This is the *domain*
 *  side of the same question the sweep above asks of the builder — the two have to agree, and ADR
 *  0017 is what makes them. */
function refusesFitWidth(
  buildId: string,
  openingWidthMm: number,
): string | undefined {
  const entry = INSERTABLE_ENTRIES.find(([id]) => id === buildId);
  if (!entry) throw new Error(`no catalogue entry for ${buildId}`);
  const body = toInsertableBody(entry[0], entry[1]);
  if (!body) throw new Error(`${buildId} is not insertable`);
  const opening: InsertOpening = {
    col: "A|1.00",
    wall: "A",
    alongM: 1,
    w: toMetres(openingWidthMm),
    y0: 0,
    h: 0.86,
    spanY0: 0,
    spanH: 0.86,
  };
  const column: Column = {
    key: "A|1.00",
    wall: "A",
    ry: 0,
    x: 1,
    z: 0.29,
    w: toMetres(openingWidthMm),
    d: 0.58,
    top: 0.86,
    regions: [[0, 0.86]],
  };
  const fit = evaluateInsertFit({ body, opening, column });
  return fit.ok ? undefined : fit.detail.code;
}

function countDoors(
  buildId: string,
  widthMm: number,
  heightMm: number,
  depthMm: number,
): number {
  const group = buildCatalogBody(kit, buildId, {
    widthM: toMetres(widthMm),
    heightM: toMetres(heightMm),
    depthM: toMetres(depthMm),
  });
  let doors = 0;
  group.traverse((node) => {
    if (node instanceof THREE.Mesh && node.name === "door_front") doors += 1;
  });
  return doors;
}

const INSERTABLE_ENTRIES: readonly (readonly [string, BodyDefinition])[] =
  INSERTABLE_BODY_DEFINITIONS;

describe("the builder table and the domain's insertable catalogue are the same set", () => {
  it("has a builder for every insertable catalogue entry", () => {
    const missing = INSERTABLE_ENTRIES.map(([buildId]) => buildId).filter(
      (buildId) => !isCatalogBuildId(buildId),
    );

    expect(missing).toEqual([]);
  });

  it("has a catalogue entry for every builder", () => {
    const catalogued = new Set(INSERTABLE_ENTRIES.map(([buildId]) => buildId));
    const orphaned = CATALOG_BUILD_IDS.filter(
      (buildId) => !catalogued.has(buildId),
    );

    expect(orphaned).toEqual([]);
  });

  it("refuses a seeded decomposition id and an unknown one alike", () => {
    expect(isCatalogBuildId("wall-2door-600-top")).toBe(false);
    expect(() =>
      buildCatalogBody(kit, "wall-2door-600-top", {
        widthM: 0.6,
        heightM: 0.4,
        depthM: 0.33,
      }),
    ).toThrow(/No catalog builder registered/);
    expect(() =>
      buildCatalogBody(kit, "not-a-body", {
        widthM: 0.6,
        heightM: 0.7,
        depthM: 0.4,
      }),
    ).toThrow(/No catalog builder registered/);
  });
});

// FINDING QA-1 — found in R1 on `base-sink` at 400 mm, fixed by ADR 0017, which took 400 out of that
// entry's `sizesMm` and gave it a `minWidthMm`. The cases below are generated live from
// `INSERTABLE_BODY_DEFINITIONS`, so this is a standing guard rather than a closed case: any width a
// catalogue entry lists as a chip in future is swept the moment it is listed.
//
// The rule it guards: every width the catalogue lists must build a carcass the engine will accept,
// or §9 offers a row that `insertBody` then refuses with `BUILT_SIZE_MISMATCH` — "a body the panel
// offers and the engine then refuses", the exact shape ADR 0016 closed for the hood.
describe("every catalogue width builds a carcass the built-size gate accepts", () => {
  const cases = INSERTABLE_ENTRIES.flatMap(([buildId, definition]) =>
    (definition.sizesMm ?? []).map((widthMm) => ({
      buildId,
      widthMm,
      heightMm: definition.nominalHeightMm ?? 0,
      depthMm: definition.nominalDepthMm ?? 0,
    })),
  );

  it.each(cases)("$buildId at $widthMm mm", (testCase) => {
    const built = build(
      testCase.buildId,
      testCase.widthMm,
      testCase.heightMm,
      testCase.depthMm,
    );

    expect(passesBuiltSizeGate(built.carcassWidthMm, testCase.widthMm)).toBe(
      true,
    );
    expect(passesBuiltSizeGate(built.carcassHeightMm, testCase.heightMm)).toBe(
      true,
    );
  });
});

// R1 finding QA-1, re-aimed at the engine that fixed it. `widthFlex: "fit"` means the body builds
// to the opening, so every width the engine will *hand* it has to build — but as of ADR 0017 that
// range starts at the entry's own `minWidthMm` where it declares one, and at §2's `MIN_WIDTH_M`
// where it does not. The floor is read from the catalogue rather than written here, so an entry
// that declares one later is covered without editing this test, and an entry that *drops* its
// floor is immediately swept from 300 mm again.
describe("a width-flexible body builds at every width the engine will hand it", () => {
  const FLEXIBLE = INSERTABLE_ENTRIES.filter(
    ([, definition]) => definition.widthFlex === "fit",
  );

  /** `resolveWidth` + `refuseNarrowOpening` (`insert-fit.ts`), as a number: the narrowest opening
   *  this entry can be inserted into. */
  function narrowestOpeningMm(definition: BodyDefinition): number {
    return Math.max(definition.minWidthMm ?? 0, 1000 * MIN_WIDTH_M);
  }

  it.each(FLEXIBLE)(
    "%s builds from its own floor to 800 mm",
    (buildId, definition) => {
      const heightMm = definition.nominalHeightMm ?? 0;
      const depthMm = definition.nominalDepthMm ?? 0;
      const floorMm = narrowestOpeningMm(definition);
      const refused: number[] = [];
      for (let widthMm = floorMm; widthMm <= 800; widthMm += 10) {
        const built = build(buildId, widthMm, heightMm, depthMm);
        if (
          !passesBuiltSizeGate(built.carcassWidthMm, widthMm) ||
          !passesBuiltSizeGate(built.carcassHeightMm, heightMm)
        ) {
          refused.push(widthMm);
        }
      }

      expect(refused).toEqual([]);
      expect(floorMm).toBeGreaterThanOrEqual(1000 * MIN_WIDTH_M);
    },
  );

  // A declared floor has to be earned. Below it the builder must actually be wrong — and wrong in
  // the direction ADR 0017 describes, a carcass that grows *wider and taller* as it is asked to
  // grow narrower. Stated generally so a future entry cannot declare a floor it does not need: an
  // entry that builds correctly one millimetre below its own floor fails here.
  const WITH_DECLARED_FLOOR = FLEXIBLE.filter(
    ([, definition]) => definition.minWidthMm !== undefined,
  );

  it.each(WITH_DECLARED_FLOOR)(
    "%s is genuinely broken below its floor",
    (buildId, definition) => {
      const floorMm = definition.minWidthMm ?? 0;
      const heightMm = definition.nominalHeightMm ?? 0;
      const depthMm = definition.nominalDepthMm ?? 0;

      const atFloor = build(buildId, floorMm, heightMm, depthMm);
      expect(atFloor.carcassWidthMm).toBeCloseTo(floorMm, 3);
      expect(atFloor.carcassHeightMm).toBeCloseTo(heightMm, 3);

      const belowFloor = build(buildId, floorMm - 1, heightMm, depthMm);
      expect(belowFloor.carcassWidthMm).toBeGreaterThan(floorMm - 1);
      expect(belowFloor.carcassHeightMm).toBeGreaterThan(heightMm);
    },
  );

  // ADR 0017's actual reasoning, as a test: the built-size gate does **not** subsume the declared
  // floor. At 550 mm the sink base's inverted worktop measures 555.4 × 866.7 mm — 5.4 mm and 6.7 mm
  // out, both *inside* `FIT_TOLERANCE_M` — so `refuseBuiltSize` accepts a body whose geometry is
  // broken. Only the explicit `minWidthMm` keeps it out. Anyone tempted to "simplify" the floor
  // away on the grounds that the re-check covers it should have to delete this test first.
  it("keeps out a 550 mm sink base that the built-size re-check would have accepted", () => {
    const inverted = build("base-sink", 550, 860, 580);

    expect(passesBuiltSizeGate(inverted.carcassWidthMm, 550)).toBe(true);
    expect(passesBuiltSizeGate(inverted.carcassHeightMm, 860)).toBe(true);
    // The geometry is wrong all the same: a narrower request produced a *taller* carcass.
    expect(inverted.carcassWidthMm).toBeGreaterThan(550);
    expect(inverted.carcassHeightMm).toBeGreaterThan(860);

    expect(refusesFitWidth("base-sink", 550)).toBe("WIDTH_TOO_SMALL");
    expect(refusesFitWidth("base-sink", SINK_MIN_WIDTH_MM - 1)).toBe(
      "WIDTH_TOO_SMALL",
    );
  });

  it("builds the sink base exactly at the aperture width the domain now admits", () => {
    const built = build("base-sink", SINK_MIN_WIDTH_MM, 860, 580);

    expect(built.carcassWidthMm).toBeCloseTo(SINK_MIN_WIDTH_MM, 3);
    expect(built.carcassHeightMm).toBeCloseTo(860, 3);
    expect(refusesFitWidth("base-sink", SINK_MIN_WIDTH_MM)).toBeUndefined();
  });
});

// The general form of the `wall-lift` defect the logic review found: two catalogue ids that build
// **indistinguishable geometry**. A size sweep cannot see it — both bodies pass the built-size gate
// at every width, because the difference is a door slab and a handle edge, neither of which is a
// carcass mesh. What makes it visible is identity rather than measurement: if two rows of the panel
// produce the same tree, one of the two products does not exist.
//
// Compared at 600 mm, the one width every entry but the freestanding fridge supports, so this is a
// property of the catalogue rather than of a hand-picked pair. Deliberately **not** asserted at
// every width: §7's wall-cabinet door rule is `w > 0.45 ? 2 : 1`, so `wall-2door` and `wall-1door`
// are legitimately the same body at 400 mm and below — that is the rule working, not two rows
// colliding, and a test that failed on it would be pressure to break the rule. The case below pins
// that coincidence too, so nobody later "fixes" it.
describe("no two catalogue ids build the same body", () => {
  /** Every mesh's name, position and geometry, in tree order — enough to tell a two-door cabinet
   *  from a one-door one, and a lift-up flap's bottom bar from a side handle. Positions are rounded
   *  to a tenth of a millimetre so float noise cannot manufacture a difference. */
  function structuralSignature(group: THREE.Object3D): string {
    const parts: string[] = [];
    group.traverse((node) => {
      if (!isMesh(node)) return;
      const position = node.getWorldPosition(new THREE.Vector3());
      const vertexCount = node.geometry.getAttribute("position").count;
      parts.push(
        [
          node.name,
          position.x.toFixed(4),
          position.y.toFixed(4),
          position.z.toFixed(4),
          node.geometry.type,
          String(vertexCount),
        ].join(","),
      );
    });
    return parts.join(";");
  }

  function signatureOf(
    buildId: string,
    definition: BodyDefinition,
    widthMm: number,
  ): string {
    const group = buildCatalogBody(kit, buildId, {
      widthM: toMetres(widthMm),
      heightM: toMetres(definition.nominalHeightMm ?? 0),
      depthM: toMetres(definition.nominalDepthMm ?? 0),
    });
    group.updateWorldMatrix(true, true);
    return structuralSignature(group);
  }

  it("gives every entry a tree no other entry produces", () => {
    const bySignature = new Map<string, string[]>();
    for (const [buildId, definition] of INSERTABLE_ENTRIES) {
      const sizesMm = definition.sizesMm ?? [];
      const widthMm = sizesMm.includes(600) ? 600 : (sizesMm[0] ?? 600);
      const signature = signatureOf(buildId, definition, widthMm);
      bySignature.set(signature, [
        ...(bySignature.get(signature) ?? []),
        buildId,
      ]);
    }

    const collisions = [...bySignature.values()].filter(
      (buildIds) => buildIds.length > 1,
    );
    expect(collisions).toEqual([]);
    expect(bySignature.size).toBe(INSERTABLE_ENTRIES.length);
  });

  // §7's door rule, pinned as intended behaviour rather than left to look like a collision.
  it("lets the two wall cabinets coincide below the two-door width, by the door rule", () => {
    const wallEntries = INSERTABLE_ENTRIES.filter(([buildId]) =>
      ["wall-2door", "wall-1door"].includes(buildId),
    );
    const [first, second] = wallEntries;
    if (!first || !second) throw new Error("both wall entries must exist");

    const narrow = wallEntries.map(([buildId, definition]) =>
      signatureOf(buildId, definition, TWO_DOOR_MIN_WIDTH_MM),
    );
    const wide = wallEntries.map(([buildId, definition]) =>
      signatureOf(buildId, definition, 600),
    );

    expect(narrow[0]).toBe(narrow[1]);
    expect(wide[0]).not.toBe(wide[1]);
  });
});

describe("the §11 rows that name a body and a number", () => {
  // Row 20: a 570 mm opening builds a 570 mm body, and the door count follows the built width.
  it("row 20 — 570 mm of wall cabinet is 570 mm wide with two doors", () => {
    const built = build("wall-2door", 570, 700, 400);

    expect(built.carcassWidthMm).toBeCloseTo(570, 3);
    expect(countDoors("wall-2door", 570, 700, 400)).toBe(2);
    expect(countDoors("wall-2door", TWO_DOOR_MIN_WIDTH_MM, 700, 400)).toBe(1);
    expect(countDoors("wall-2door", TWO_DOOR_MIN_WIDTH_MM + 10, 700, 400)).toBe(
      2,
    );
  });

  // Row 14: the dishwasher niche accepts only 450 and 600, and both build a real carcass.
  it.each([450, 600])(
    "row 14 — the dishwasher niche builds at %i mm",
    (widthMm) => {
      const built = build("base-dishwasher", widthMm, 860, 580);

      expect(built.carcassWidthMm).toBeCloseTo(widthMm, 3);
      expect(built.carcassHeightMm).toBeCloseTo(860, 3);
    },
  );

  // Row 6 / ADR 0016: the hood's carcass is canopy + chimney, so it measures its catalogue height
  // and is accepted into a slot that fits 710 mm.
  it.each([600, 900])(
    "row 6 — the hood measures 710 mm of carcass at %i mm wide",
    (widthMm) => {
      const built = build("hood", widthMm, 710, 500);

      expect(built.carcassHeightMm).toBeCloseTo(710, 3);
      expect(built.carcassWidthMm).toBeCloseTo(widthMm, 3);
      // `fullHeightM` stays the whole group: the filter dips below the canopy (ADR 0016).
      expect(built.fullHeightMm).toBeGreaterThan(built.carcassHeightMm);
    },
  );

  // Row 7: the sink base fits an 860 mm opening because the faucet is not carcass.
  it("row 7 — the sink base measures 860 mm of carcass and reports the faucet separately", () => {
    const built = build("base-sink", 800, 860, 580);

    expect(built.carcassHeightMm).toBeCloseTo(860, 3);
    expect(built.fullHeightMm).toBeGreaterThan(built.carcassHeightMm);
    expect(built.fullHeightMm).toBeCloseTo(1224, 0);
  });
});

// Boundaries the *builders* do not guard. Each is checked as "the engine's own gate catches it",
// which is the only guarantee 3B is entitled to make — none of these is reachable through
// `insertBody`, and the assertions below say why in the values they use.
describe("boundaries the builders do not guard", () => {
  it("a hood built at or below its canopy height reports the canopy, and the gate refuses it", () => {
    const atCanopy = build("hood", 600, 130, 500);
    const belowCanopy = build("hood", 600, 100, 500);

    expect(atCanopy.carcassHeightMm).toBeCloseTo(130, 3);
    expect(belowCanopy.carcassHeightMm).toBeCloseTo(130, 3);
    expect(passesBuiltSizeGate(belowCanopy.carcassHeightMm, 100)).toBe(false);
  });

  it("builds a 2 mm sliver at width zero that only MIN_WIDTH_M keeps out", () => {
    const zero = build("base-2door", 0, 860, 580);
    const negative = build("base-2door", -100, 860, 580);

    expect(zero.carcassWidthMm).toBeLessThan(10);
    // The built-size re-check does **not** catch this one: 2 mm against a required 0 is inside
    // `FIT_TOLERANCE_M`. `resolveWidth`'s `MIN_WIDTH_M` floor (`insert-fit.ts`) is the only guard,
    // which is why it is asserted here rather than assumed.
    expect(passesBuiltSizeGate(zero.carcassWidthMm, 0)).toBe(true);
    expect(MIN_WIDTH_M).toBeGreaterThan(0);
    // A negative width is caught by the gate as well as by the floor.
    expect(passesBuiltSizeGate(negative.carcassWidthMm, -100)).toBe(false);
  });

  it("a height-flexible body builds its carcass at the 400 mm minimum opening", () => {
    for (const buildId of [
      "wall-2door",
      "wall-1door",
      "wall-lift",
      "open-shelf",
    ]) {
      const built = build(buildId, 600, 400, 400);
      expect(passesBuiltSizeGate(built.carcassHeightMm, 400)).toBe(true);
    }
  });
});
