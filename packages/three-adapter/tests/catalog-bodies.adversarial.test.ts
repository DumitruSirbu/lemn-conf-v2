// §7 conformance, entry by entry and width by width, against the catalogue the domain ships and through the gate
// `insertBody` applies (`refuseBuiltSize`, `FIT_TOLERANCE_M`). It catches a body the panel offers and the engine
// then refuses (ADR 0016), which a builder test asserting only "a group with meshes" cannot see.
import {
  DEFAULT_CABINET_DEPTH_MM,
  evaluateInsertFit,
  FIT_TOLERANCE_M,
  describeBodyLabelAt,
  entryLabel,
  labelWithDoors,
  type BodyLabel,
  INSERTABLE_BODY_DEFINITIONS,
  MIN_WIDTH_M,
  recordedClearanceM,
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

/**
 * The two-door threshold, written out rather than imported from the domain (ADR 0033): a test reading the same
 * constant could only agree with it, so a product change must move this line too.
 */
const TWO_DOOR_MIN_WIDTH_MM = 500;

/** ADR 0017: the sink aperture's own width, the number the reasoning turns on. */
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
      seatedOn: "wall-plane",
    },
  });
  return {
    carcassWidthMm: 1000 * measurement.carcassWidthM,
    carcassHeightMm: 1000 * measurement.carcassHeightM,
    fullHeightMm: 1000 * measurement.fullHeightM,
  };
}

/** `refuseBuiltSize` (`commands/insert-body.ts`) restated as a predicate, so the sweep asserts the engine's gate. */
function passesBuiltSizeGate(builtMm: number, requiredMm: number): boolean {
  return (
    Number.isFinite(builtMm) &&
    Math.abs(toMetres(builtMm) - toMetres(requiredMm)) <= FIT_TOLERANCE_M
  );
}

/**
 * §5.2's pre-probe width guard for one entry against a base opening of the given width: the refusal code, or
 * `undefined` when the engine would accept it.
 */
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
    d: recordedClearanceM(0.58),
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
    hasFullHeightUnder: true,
  };
  const fit = evaluateInsertFit({
    body,
    opening,
    column,
    cabinetDepthMm: DEFAULT_CABINET_DEPTH_MM,
  });
  return fit.ok ? undefined : fit.detail.code;
}

/**
 * Doors stood side by side, counted as distinct x centres of `door_front` meshes: a stacked-front body (the 600 mm
 * pantry, ADR 0048) has four slabs but is a two-door cabinet.
 */
function countDoorsAbreast(
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
  const centresX = new Set<number>();
  group.traverse((node) => {
    if (node instanceof THREE.Mesh && node.name === "door_front") {
      centresX.add(
        Math.round(node.getWorldPosition(new THREE.Vector3()).x * 1e6),
      );
    }
  });
  return centresX.size;
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

// Generated live from `INSERTABLE_BODY_DEFINITIONS`, so any width a catalogue entry lists is swept. A listed width
// that builds a carcass `insertBody` refuses is a body the panel offers and the engine refuses (ADR 0016, 0017).
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

// `widthFlex: "fit"` bodies must build at every width the engine hands them: from the entry's own `minWidthMm`
// (ADR 0017), else `MIN_WIDTH_M`. The floor is read from the catalogue, so a declared or dropped floor is covered.
describe("a width-flexible body builds at every width the engine will hand it", () => {
  const FLEXIBLE = INSERTABLE_ENTRIES.filter(
    ([, definition]) => definition.widthFlex === "fit",
  );

  /**
   * `resolveWidth` + `refuseWidthFloor` (`insert-fit.ts`) as a number: the narrowest opening this entry accepts. A
   * declaration below §2's default replaces it for that entry; one at or above it is checked after it (ADR 0026).
   */
  function narrowestOpeningMm(definition: BodyDefinition): number {
    const declaredMm = definition.minWidthMm;
    if (declaredMm === undefined) return 1000 * MIN_WIDTH_M;
    if (declaredMm < 1000 * MIN_WIDTH_M) return declaredMm;
    return Math.max(declaredMm, 1000 * MIN_WIDTH_M);
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
      // The floor is §2's default unless the row declares its own, in either direction (ADR 0026).
      expect(floorMm).toBe(definition.minWidthMm ?? 1000 * MIN_WIDTH_M);
    },
  );

  // An upward floor must be earned (ADR 0017, ADR 0026 clause 2): it admits a builder limitation, so below it the
  // builder must be wrong, a carcass growing wider and taller as it is asked narrower. A downward floor is a product
  // decision (ADR 0026 clause 3), covered by the sweep above.
  const WITH_UPWARD_FLOOR = FLEXIBLE.filter(
    ([, definition]) =>
      definition.minWidthMm !== undefined &&
      definition.minWidthMm >= 1000 * MIN_WIDTH_M,
  );

  it.each(WITH_UPWARD_FLOOR)(
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

  // The built-size gate does not subsume the declared floor (ADR 0017): the 550 mm sink base is inside
  // `FIT_TOLERANCE_M` yet geometrically broken, so only `minWidthMm` keeps it out.
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

  // The builder is correct at the aperture width (ADR 0017's measurement, and why 560 was chosen over 550).
  it("builds the sink base correctly at the aperture width, as ADR 0017 measured it", () => {
    const built = build("base-sink", SINK_MIN_WIDTH_MM, 860, 580);

    expect(built.carcassWidthMm).toBeCloseTo(SINK_MIN_WIDTH_MM, 3);
    expect(built.carcassHeightMm).toBeCloseTo(860, 3);
  });

  // The engine takes the sink from the aperture to the two-door maximum: cabinetry with a fixed aperture (ADR 0033).
  it("and the engine takes it there, from the aperture to the two-door maximum", () => {
    expect(refusesFitWidth("base-sink", SINK_MIN_WIDTH_MM)).toBeUndefined();
    expect(refusesFitWidth("base-sink", 600)).toBeUndefined();
    expect(refusesFitWidth("base-sink", 800)).toBeUndefined();
    expect(refusesFitWidth("base-sink", SINK_MIN_WIDTH_MM - 1)).toBe(
      "WIDTH_TOO_SMALL",
    );
    expect(refusesFitWidth("base-sink", 801)).toBe("WIDTH_NOT_SUPPORTED");
  });
});

// Two catalogue ids building indistinguishable geometry pass every size sweep (a door slab and a handle edge are
// not carcass meshes), so this compares identity: two rows producing one tree means one product does not exist.
// Compared at 600 mm, the one width every entry but the freestanding fridge supports.
describe("no two catalogue ids build the same body", () => {
  /** Every mesh's name, position and geometry in tree order, positions rounded to 0.1 mm against float noise. */
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

  // The converse of the old pair-collision case (ADR 0033): one entry must build two different trees across the door
  // threshold, else merging the pair would have quietly deleted a product.
  it("builds two different trees from one wall entry, across the door threshold", () => {
    const entry = INSERTABLE_ENTRIES.find(([id]) => id === "wall-cabinet");
    if (!entry) throw new Error("no wall-cabinet entry");
    const [buildId, definition] = entry;

    expect(signatureOf(buildId, definition, 400)).not.toBe(
      signatureOf(buildId, definition, 600),
    );
    // The signature carries dimensions as well as shape, so the door count is what must differ, counted off bodies.
    expect(countDoorsAbreast(buildId, 400, 700, 400)).not.toBe(
      countDoorsAbreast(buildId, 600, 700, 400),
    );
  });
});

/**
 * The door count the catalogue claims, read off the domain's descriptor; `undefined` for a label that claims no
 * count, which is not the same as zero.
 */
function declaredDoorCount(label: BodyLabel): number | undefined {
  return label.kind === "withDoors" ? label.doors : undefined;
}

describe("a derived label that counts doors, against the doors the builder actually makes", () => {
  // The label's door count and the builder's both derive from one threshold (ADR 0033), so one side of every
  // comparison is counted off a body the real builders made, and 400 and 600 are written out: both sides moving
  // together still fails. Lives in the adapter because the I/O-free domain cannot see a builder.
  it("builds the door count its derived label claims, at every width it declares", () => {
    const claiming = INSERTABLE_ENTRIES.filter(
      ([, definition]) => definition.doorCountFollowsWidth === true,
    );
    // `tall-pantry` joins this sweep by declaring the flag (ADR 0048).
    expect(claiming.map(([buildId]) => buildId)).toEqual([
      "base-cabinet",
      "wall-cabinet",
      "tall-pantry",
    ]);

    let swept = 0;
    for (const [buildId, definition] of claiming) {
      const heightMm = definition.nominalHeightMm ?? 700;
      const depthMm = definition.nominalDepthMm ?? 400;
      for (const widthMm of definition.sizesMm ?? []) {
        const claimed = declaredDoorCount(
          describeBodyLabelAt({ buildId, definition }, widthMm),
        );
        expect([
          buildId,
          widthMm,
          countDoorsAbreast(buildId, widthMm, heightMm, depthMm),
        ]).toEqual([buildId, widthMm, claimed]);
        swept += 1;
      }
    }
    // Thirteen widths for each of the two cabinets plus the pantry's nine (400 to 800, ADR 0048): a sweep that silently
    // stopped naming widths would otherwise pass by asserting nothing.
    expect(swept).toBe(35);
  });

  // Both widths are written out and counted off real geometry, so this fails if the threshold moves in either package;
  // the label and the builder share one constant and would otherwise move together.
  it("flips from one door to two between the two widths either side of the threshold", () => {
    expect(countDoorsAbreast("wall-cabinet", 400, 700, 400)).toBe(1);
    expect(countDoorsAbreast("wall-cabinet", 600, 700, 400)).toBe(2);
    expect(countDoorsAbreast("base-cabinet", 400, 860, 580)).toBe(1);
    expect(countDoorsAbreast("base-cabinet", 600, 860, 580)).toBe(2);
    // ADR 0048's ends and the threshold between; 399 and 801 are outside the row's bound and refused by the domain.
    expect(countDoorsAbreast("tall-pantry", 400, 2200, 560)).toBe(1);
    expect(countDoorsAbreast("tall-pantry", 499, 2200, 560)).toBe(1);
    expect(countDoorsAbreast("tall-pantry", 500, 2200, 560)).toBe(2);
    expect(countDoorsAbreast("tall-pantry", 800, 2200, 560)).toBe(2);
  });

  // ADR 0030's one-door cap is retired (ADR 0035): the builder makes one door across (400, 500) and two from 500 up, so
  // the cap was a product choice rather than a builder limitation.
  it("makes one door across the band ADR 0030's retired cap used to skip", () => {
    expect(countDoorsAbreast("wall-cabinet", 430, 700, 400)).toBe(1);
    expect(countDoorsAbreast("wall-cabinet", 450, 700, 400)).toBe(1);
    expect(countDoorsAbreast("wall-cabinet", 499, 700, 400)).toBe(1);
    const entry = INSERTABLE_ENTRIES.find(([id]) => id === "wall-cabinet");
    expect(entry?.[1].sizesMm).toContain(450);
    expect(entry?.[1].sizesMm).toContain(500);
  });

  // The threshold pinned to the millimetre: 500 is two doors and 499 one, a pair no other value satisfies. The
  // comparison is `>=` (ADR 0035 decision 4). `TWO_DOOR_MIN_WIDTH_MM` is this file's own literal, so a product
  // change must move it on purpose.
  it("pins the flip to 500 exactly, and to no other width", () => {
    expect(
      countDoorsAbreast("wall-cabinet", TWO_DOOR_MIN_WIDTH_MM, 700, 400),
    ).toBe(2);
    expect(
      countDoorsAbreast("wall-cabinet", TWO_DOOR_MIN_WIDTH_MM - 1, 700, 400),
    ).toBe(1);
    expect(
      countDoorsAbreast("base-cabinet", TWO_DOOR_MIN_WIDTH_MM, 860, 580),
    ).toBe(2);
    expect(
      countDoorsAbreast("base-cabinet", TWO_DOOR_MIN_WIDTH_MM - 1, 860, 580),
    ).toBe(1);
  });

  // The words the forms render into belong to the catalogue (`apps/web/tests/i18n/body-label.test.ts`); the domain
  // owes the count.
  it("takes the two forms the entries it replaced did", () => {
    const entry = INSERTABLE_ENTRIES.find(([id]) => id === "wall-cabinet");
    if (!entry) throw new Error("no wall-cabinet entry");
    const body = { buildId: "wall-cabinet", definition: entry[1] };

    expect(describeBodyLabelAt(body, 400)).toEqual(
      labelWithDoors(entryLabel("wall-cabinet"), 1),
    );
    expect(describeBodyLabelAt(body, 600)).toEqual(
      labelWithDoors(entryLabel("wall-cabinet"), 2),
    );
  });
});

describe("the §11 rows that name a body and a number", () => {
  // Row 20 is a builder-fidelity claim only: `buildCatalogBody` is called at 570, a width the engine no longer hands
  // a wall cabinet (ADR 0033's merged set has no member between 400 and 600).
  it("row 20 — 570 mm of wall cabinet is 570 mm wide with two doors", () => {
    const built = build("wall-cabinet", 570, 700, 400);

    expect(built.carcassWidthMm).toBeCloseTo(570, 3);
    expect(countDoorsAbreast("wall-cabinet", 570, 700, 400)).toBe(2);
  });

  it.each([450, 600])(
    "row 14 — the dishwasher niche builds at %i mm",
    (widthMm) => {
      const built = build("base-dishwasher", widthMm, 860, 580);

      expect(built.carcassWidthMm).toBeCloseTo(widthMm, 3);
      expect(built.carcassHeightMm).toBeCloseTo(860, 3);
    },
  );

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

  it("row 7 — the sink base measures 860 mm of carcass and reports the faucet separately", () => {
    const built = build("base-sink", 800, 860, 580);

    expect(built.carcassHeightMm).toBeCloseTo(860, 3);
    expect(built.fullHeightMm).toBeGreaterThan(built.carcassHeightMm);
    expect(built.fullHeightMm).toBeCloseTo(1224, 0);
  });
});

// Each boundary is checked as "the engine's own gate catches it"; none is reachable through `insertBody`.
describe("boundaries the builders do not guard", () => {
  it("a hood built at or below its canopy height reports the canopy, and the gate refuses it", () => {
    const atCanopy = build("hood", 600, 130, 500);
    const belowCanopy = build("hood", 600, 100, 500);

    expect(atCanopy.carcassHeightMm).toBeCloseTo(130, 3);
    expect(belowCanopy.carcassHeightMm).toBeCloseTo(130, 3);
    expect(passesBuiltSizeGate(belowCanopy.carcassHeightMm, 100)).toBe(false);
  });

  it("builds a 2 mm sliver at width zero that only MIN_WIDTH_M keeps out", () => {
    const zero = build("base-cabinet", 0, 860, 580);
    const negative = build("base-cabinet", -100, 860, 580);

    expect(zero.carcassWidthMm).toBeLessThan(10);
    // The built-size re-check does not catch this (2 mm against 0 is inside `FIT_TOLERANCE_M`); `resolveWidth`'s
    // `MIN_WIDTH_M` floor (`insert-fit.ts`) is the only guard.
    expect(passesBuiltSizeGate(zero.carcassWidthMm, 0)).toBe(true);
    expect(MIN_WIDTH_M).toBeGreaterThan(0);
    expect(passesBuiltSizeGate(negative.carcassWidthMm, -100)).toBe(false);
  });
});
