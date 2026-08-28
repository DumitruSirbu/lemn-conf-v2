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
  describeBodyLabelAt,
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

/** §7's wall-cabinet door rule is `w > 0.45 ? 2 : 1`; §11 row 20 is the 570 mm case.
 *
 *  **Written out rather than imported, deliberately.** ADR 0033 moved the live constant into the
 *  domain so the builder and the label read one number; a test that read that same number back could
 *  only ever agree with it. This is the independent copy the gate compares against, and the day the
 *  product decision moves, this line has to move with it — on purpose. */
const TWO_DOOR_MIN_WIDTH_MM = 500;

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
    d: 0.58,
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

  /** `resolveWidth` + `refuseWidthFloor` (`insert-fit.ts`), as a number: the narrowest opening
   *  this entry can be inserted into.
   *
   *  **It has a direction** (ADR 0026, and this read `Math.max` until 2026-08-27). A declaration
   *  *below* §2's default **replaces** it for that entry alone, so the sweep below has to start at
   *  the declaration and not at 300 — otherwise the two widths ADR 0030's amendment made reachable
   *  on a one-door cabinet would never be built here at all. A declaration at or above the default
   *  is checked after it, so `Math.max` is still right in that direction. */
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
      // The floor is §2's default unless the row declares one of its own, in either direction
      // (ADR 0026). Asserted as that rather than as ">= 300", which was true only while every
      // declaration pointed upward.
      expect(floorMm).toBe(definition.minWidthMm ?? 1000 * MIN_WIDTH_M);
    },
  );

  // A floor declared **upward** has to be earned. ADR 0017 and ADR 0026 clause 2 read that
  // direction as a *builder limitation* — an entry admitting its builder is not parameterised — so
  // below it the builder must actually be wrong, and wrong in the direction ADR 0017 describes: a
  // carcass that grows *wider and taller* as it is asked to grow narrower. Stated generally so a
  // future entry cannot declare an upward floor it does not need.
  //
  // **A floor declared downward is a different claim and is swept differently** (ADR 0026 clause
  // 3, and this filter took every declaration until 2026-08-27). It is a *product decision* — the
  // owner asserting that a cabinet that narrow is a thing they sell — and says nothing about the
  // builder, which is why demanding the builder break below it is the wrong question. What those
  // rows owe is that the builder is correct at and above their own floor, which is exactly the
  // sweep above, now that it starts where they declare rather than at 300.
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

  // **The two facts came apart at ADR 0032**, and keeping them in one test would have hidden which
  // one moved. The *builder* is still correct at the aperture — that is ADR 0017's measurement and
  // it is the reason 560 was chosen over 550. The *engine* no longer takes the sink there, because
  // `[600, 800]` is now a bound on the `'fit'` path too, so 560 is a width this entry does not have
  // even though its geometry at 560 is sound.
  it("builds the sink base correctly at the aperture width, as ADR 0017 measured it", () => {
    const built = build("base-sink", SINK_MIN_WIDTH_MM, 860, 580);

    expect(built.carcassWidthMm).toBeCloseTo(SINK_MIN_WIDTH_MM, 3);
    expect(built.carcassHeightMm).toBeCloseTo(860, 3);
  });

  // **And built there, which is where ADR 0017 started.** 5C2 briefly made `[600, 800]` a bound and
  // this case asserted a refusal at the aperture; ADR 0033's amendment reads the sink as cabinetry
  // with a fixed aperture, so the engine takes it there again — and the measurement above is why 560
  // was chosen over 550 in the first place. The two halves of the original finding now agree.
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

  // **This case is retired by ADR 0033 and replaced by its converse.** It used to pin the one place
  // two catalogue ids legitimately built the same tree: `wall-2door` and `wall-1door` at 400 mm were
  // both a one-door carcass, which the collision sweep above would otherwise have read as a defect.
  // There is no second id any more, so the collision cannot happen — and the thing worth asserting
  // is the opposite one: that the **same** entry builds two different trees, on the two sides of the
  // threshold. If it did not, merging the pair would have quietly deleted a product.
  it("builds two different trees from one wall entry, across the door threshold", () => {
    const entry = INSERTABLE_ENTRIES.find(([id]) => id === "wall-cabinet");
    if (!entry) throw new Error("no wall-cabinet entry");
    const [buildId, definition] = entry;

    expect(signatureOf(buildId, definition, 400)).not.toBe(
      signatureOf(buildId, definition, 600),
    );
    // A structural signature carries dimensions as well as shape, so the line above alone would also
    // pass for two widths that build the same cabinet. The *door count* is the part that has to
    // differ, and it is counted off the built bodies rather than read out of a string.
    expect(countDoors(buildId, 400, 700, 400)).not.toBe(
      countDoors(buildId, 600, 700, 400),
    );
  });
});

/** §7's labels count doors in Romanian: "2 uși", "1 ușă". `undefined` for a label that claims no
 *  count — `Corp spălător`, `Etajeră deschisă`, `Hotă` — which is not the same as claiming zero.
 *
 *  It parses the **derived** label now (ADR 0033), not a declared one, which is what makes the sweep
 *  below a check rather than a restatement: the string comes out of the domain's own renderer and
 *  the number it is compared against is counted off a built body. */
function declaredDoorCount(label: string): number | undefined {
  const claim = /(\d+)\s+(?:uși|ușă)/u.exec(label);
  return claim?.[1] === undefined ? undefined : Number(claim[1]);
}

describe("a derived label that counts doors, against the doors the builder actually makes", () => {
  // ADR 0029 (owner, 2026-08-27), closing finding R1.2 — and this is the test that made it a rule
  // rather than a number. §7's wall builder is `w > 0.45 ? 2 : 1`, so `wall-2door` at 400 mm built
  // **one** door under a two-door label, priced as two and badged ACTUAL as two. §6.3's
  // fridge-housing-priced-as-a-pantry, one layer along.
  //
  // **ADR 0033 changed what this gate can be, and it had to.** The label was a declared string and
  // the door count was a declared set; now both are derived from `TWO_DOOR_MIN_WIDTH_MM`, so a naive
  // rewrite would compare the derivation with itself and pass forever. What keeps it honest is that
  // one side of every comparison below is **counted off a body the real builders made** — the meshes
  // are a measurement, not a restatement — and the widths 400 and 600 are written out rather than
  // derived from the threshold, so both sides moving together still fails.
  //
  // **This test belongs in the adapter, and only here.** `@lemnaria/configurator-domain` is I/O-free
  // and sits below this package, so it cannot see a builder; the adapter already imports
  // `INSERTABLE_BODY_DEFINITIONS` and is the one place both halves are visible at once.
  it("builds the door count its derived label claims, at every width it declares", () => {
    const claiming = INSERTABLE_ENTRIES.filter(
      ([, definition]) => definition.doorCountFollowsWidth === true,
    );
    expect(claiming.map(([buildId]) => buildId)).toEqual([
      "base-cabinet",
      "wall-cabinet",
    ]);

    let swept = 0;
    for (const [buildId, definition] of claiming) {
      const heightMm = definition.nominalHeightMm ?? 700;
      const depthMm = definition.nominalDepthMm ?? 400;
      for (const widthMm of definition.sizesMm ?? []) {
        const claimed = declaredDoorCount(
          describeBodyLabelAt(definition, widthMm),
        );
        expect([
          buildId,
          widthMm,
          countDoors(buildId, widthMm, heightMm, depthMm),
        ]).toEqual([buildId, widthMm, claimed]);
        swept += 1;
      }
    }
    // Two entries times thirteen chips — five apiece until ADR 0035 decision 1 stepped the bound at
    // 50 mm, and twelve until the owner retired ADR 0030's cap on 2026-08-28 and 450 joined the row.
    // A sweep that silently stopped naming widths would otherwise pass by asserting nothing.
    expect(swept).toBe(26);
  });

  // **The anchor, and the reason the sweep above is not circular.** Both numbers are written out and
  // both are counted off real geometry, so this fails if the threshold moves in *either* package —
  // which is the drift the merge would otherwise have made invisible, since the label and the
  // builder now read one constant and would move together.
  it("flips from one door to two between the two widths either side of the threshold", () => {
    expect(countDoors("wall-cabinet", 400, 700, 400)).toBe(1);
    expect(countDoors("wall-cabinet", 600, 700, 400)).toBe(2);
    expect(countDoors("base-cabinet", 400, 860, 580)).toBe(1);
    expect(countDoors("base-cabinet", 600, 860, 580)).toBe(2);
  });

  // The band that used to be skipped, and is not any more. ADR 0030 capped a single hinged door at
  // 400 for the swing arc, which put (400, 500) outside the entry's chips; the owner retired that cap
  // on 2026-08-28 — "make it still 500, so it'll cover this gap between 450 and 500" — so the band is
  // ordinary one-door territory and the entry's widths are one continuous bound.
  //
  // What this file asserts is the **geometry**: the builder makes one door across the whole band and
  // two from 500 up, which is what makes the retired cap a product choice rather than a builder limitation.
  it("makes one door across the band ADR 0030's retired cap used to skip", () => {
    expect(countDoors("wall-cabinet", 430, 700, 400)).toBe(1);
    expect(countDoors("wall-cabinet", 450, 700, 400)).toBe(1);
    expect(countDoors("wall-cabinet", 499, 700, 400)).toBe(1);
    const entry = INSERTABLE_ENTRIES.find(([id]) => id === "wall-cabinet");
    expect(entry?.[1].sizesMm).toContain(450);
    expect(entry?.[1].sizesMm).toContain(500);
  });

  // **The threshold itself, pinned to the millimetre** (QA finding Q1.3).
  //
  // The anchors above bracket it at 400 and 600, and the band case at 430; measured, that left the
  // whole repository green for a wide window of thresholds. The pin has to be the width *at* the
  // flip and its immediate predecessor, because a two-door at 500 and a one-door at 499 is the only
  // pair no other value satisfies.
  //
  // **The comparison is `>=` (ADR 0035 decision 4)**, which is why the pin is `- 1` and not `+ 1`.
  // It was `>` against 450, so 450 got one door and 451 got two; at 500 with `>=` the constant
  // finally describes the value it names.
  //
  // `TWO_DOOR_MIN_WIDTH_MM` is **this file's own literal**, never imported from the domain — that is
  // the whole point of it. Both numbers still come back from `door_front` meshes counted off bodies
  // the real builders made, so the product decision moving requires this line to move with it, on
  // purpose.
  it("pins the flip to 500 exactly, and to no other width", () => {
    expect(countDoors("wall-cabinet", TWO_DOOR_MIN_WIDTH_MM, 700, 400)).toBe(2);
    expect(
      countDoors("wall-cabinet", TWO_DOOR_MIN_WIDTH_MM - 1, 700, 400),
    ).toBe(1);
    expect(countDoors("base-cabinet", TWO_DOOR_MIN_WIDTH_MM, 860, 580)).toBe(2);
    expect(
      countDoors("base-cabinet", TWO_DOOR_MIN_WIDTH_MM - 1, 860, 580),
    ).toBe(1);
  });

  // The label the customer reads, spelled out once. Romanian counts its nouns, and the two forms are
  // byte-identical to what the two retired entries carried — which is what makes ADR 0033 a merge
  // rather than a rename.
  it("names the two forms exactly as the entries it replaced did", () => {
    const entry = INSERTABLE_ENTRIES.find(([id]) => id === "wall-cabinet");
    if (!entry) throw new Error("no wall-cabinet entry");

    expect(describeBodyLabelAt(entry[1], 400)).toBe("Corp suspendat 1 ușă");
    expect(describeBodyLabelAt(entry[1], 600)).toBe("Corp suspendat 2 uși");
  });
});

describe("the §11 rows that name a body and a number", () => {
  // Row 20: a 570 mm opening builds a 570 mm body, and the door count follows the built width.
  //
  // **This is a builder-fidelity claim, not an end-to-end demonstration of the row** (QA finding
  // Q1.2). `buildCatalogBody` is called directly at 570, which is a width the engine will no longer
  // hand a wall cabinet — ADR 0033's merged set has no member between 400 and 600. See the note on
  // `insert-body.test.ts`'s row-20 case for which half of the row is still reachable and which is
  // not.
  //
  // The threshold pair that used to sit here has moved to "pins the flip to 450 exactly": stated as
  // `TWO_DOOR_MIN_WIDTH_MM` and `+ 10` it was true for any threshold within 10 mm, which is a claim
  // about this file agreeing with itself rather than about the number.
  it("row 20 — 570 mm of wall cabinet is 570 mm wide with two doors", () => {
    const built = build("wall-cabinet", 570, 700, 400);

    expect(built.carcassWidthMm).toBeCloseTo(570, 3);
    expect(countDoors("wall-cabinet", 570, 700, 400)).toBe(2);
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
    const zero = build("base-cabinet", 0, 860, 580);
    const negative = build("base-cabinet", -100, 860, 580);

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
      "wall-cabinet",
      "wall-cabinet",
      "wall-lift",
      "open-shelf",
    ]) {
      const built = build(buildId, 600, 400, 400);
      expect(passesBuiltSizeGate(built.carcassHeightMm, 400)).toBe(true);
    }
  });
});
