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
  cabinetDepthRuleOf,
  columnBuildDepthMm,
  depthFollowsSetting,
  pinnedAtFinishedDepthMm,
  UndeclaredCabinetDepthRuleError,
} from "../src/cabinet-depth-rule.js";
import {
  buildInsertableBodyDefinitions,
  INSERTABLE_BODY_DEFINITIONS,
  type CatalogEntry,
} from "../src/catalog.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  refuseUndeclaredDepthRules,
} from "../src/fixtures/kitchen-l-design.js";
import type { BodyCatalog, BodyDefinition } from "../src/void-engine.js";
import {
  CabinetDepthBelowMinimumError,
  declaredWorktopDepthsMm,
  MIN_CABINET_DEPTH_MM,
  requireDeclaredCabinetDepthMm,
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
  // **Re-baselined 2026-09-05, declared rather than silent** (`docs/WORKFLOW.md`: a re-baseline is
  // announced, never relaxed). `frameDepthMm` moved 330 → 291 for the two fronted wall rows under
  // ADR 0075 decision 1: this field is twice the rear overhang (ADR 0018) and `wallCabinet` builds
  // `D − 39` centred on z = 0, so 330 was the finished cabinet standing in a field that means the
  // shell. The arithmetic, written out because a moved snapshot number is otherwise indistinguishable
  // from a hidden defect: **330 declared − 39 front assembly = 291 shell**. The nominal is untouched
  // at 330 — that is what §7 declares, what the customer is told (ADR 0036 decision 1) and what the
  // builder is handed.
  //
  // **No geometry moves.** M1's parity gate diffs `makeKit()`'s builders, which read no catalogue
  // field; this one is only `deriveFrame`'s fallback for a placement with **no measured seat**, and
  // the seeded rows spread `wallCarcass`, which sets one. What changes is a stored document that
  // carries an unmeasured `wall-cabinet` placement: it seated 39 mm off the wall plane before and
  // seats correctly now — a correction on load, not a migration.
  ["wall-cabinet", 330, 291, recordedShell(39)],
  ["wall-lift", 330, 291, recordedShell(39)],
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

/** Every depth-bearing field of one entry as a single comparable value. "Moved" has to be all three
 *  and not the finished depth alone: a fronted wall carcass declares the same `+39` rule at both
 *  depths, and what the setting moves is the shell that rule is measured from. */
function depthFactsJson(definition: BodyDefinition): string {
  return JSON.stringify([
    definition.nominalDepthMm,
    definition.frameDepthMm,
    definition.occupiedDepth,
  ]);
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
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 600, hasFullHeightUnder: false }),
    ).toBe(330);
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
        columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder: false }),
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

  // **6H's recorded carry-out, closed by wave 6I.** This test read `580` at both depths and said
  // *"6I is expected to change this line"*: a base entry's `nominalDepthMm` was the literal
  // `BASE_DEPTH_MM`, so a catalogue built at 700 declared a body finishing at 720 on a 580 mm seat —
  // a back face 50 mm off the wall plane for any placement `void-engine.ts` had to fall back to it
  // for (§11 row 19). Both numbers are measured on the built meshes by
  // `occupied-depth.parity.test.ts`; they are written here as data for 6H's own reason.
  it("moves the base seat with the setting, which 6H left as a literal", () => {
    expect(entryAt(600, "base-cabinet").nominalDepthMm).toBe(580);
    expect(entryAt(700, "base-cabinet").nominalDepthMm).toBe(680);
  });
});

describe("wave 6I: every base-band body follows the formula, not just `baseCabinet`", () => {
  // The carry-out `docs/milestones/M5-width.md` hands M6 by name. 5F's QA measured the corner,
  // return, dishwasher and oven-tower bodies staying byte-identical across depths while
  // `baseCabinet` moved; the criterion is that each moves by **the same amount** as the formula
  // moves that one by. The mesh-backed half of this lives in `@lemnaria/three-adapter`
  // (`occupied-depth.parity.test.ts`); this is the declaration it holds to.
  const BASE_BAND_BUILD_IDS = buildInsertableBodyDefinitions(WORKTOP_DEPTH_MM)
    .filter(([, definition]) => definition.band === "base")
    .map(([buildId]) => buildId);

  function finishedDepthShiftMm(buildId: string): number {
    return (
      finishedDepthMmOf(entryAt(700, buildId)) -
      finishedDepthMmOf(entryAt(600, buildId))
    );
  }

  it("sweeps the whole base band and not a hand-picked row", () => {
    expect(BASE_BAND_BUILD_IDS).toEqual([
      "base-cabinet",
      "base-3drawer",
      "base-panbank",
      "base-hob-2drawer",
      "base-hob-oven",
      "base-bottle-cargo",
      "base-sink",
      "base-dishwasher",
    ]);
  });

  it.each(BASE_BAND_BUILD_IDS)(
    "%s moves by exactly what the formula moves `base-cabinet` by",
    (buildId) => {
      expect(finishedDepthShiftMm(buildId)).toBe(
        finishedDepthShiftMm("base-cabinet"),
      );
    },
  );

  // The shift being 100 is what stops "they all agree" from being satisfied by nothing moving at
  // all — the exact failure mode 5F's QA found, where four families agreed by all standing still.
  it("moves them by the 100 mm the two declared depths differ by", () => {
    expect(finishedDepthShiftMm("base-cabinet")).toBe(100);
  });

  it("keeps the hob-and-oven base proud of its own worktop by the appliance's own 28 mm", () => {
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(finishedDepthMmOf(entryAt(cabinetDepthMm, "base-hob-oven"))).toBe(
        finishedDepthMmOf(entryAt(cabinetDepthMm, "base-cabinet")) + 28,
      );
    }
  });
});

describe("wave 6I: a full-height cabinet is cabinetry and what stands in it is not", () => {
  // The criterion is that each body **states which of the two it is** and that a test asserts the
  // split rather than everything moving together. `COLUMN_DEPTH_MM` and
  // `OVEN_TOWER_FINISHED_DEPTH_MM` were both literals before this wave.
  it("moves a column's carcass with the setting", () => {
    expect(entryAt(600, "tall-pantry").nominalDepthMm).toBe(560);
    expect(entryAt(700, "tall-pantry").nominalDepthMm).toBe(660);
  });

  it("moves every full-height carcass, not only the pantry the map is checked on", () => {
    for (const buildId of [
      "tall-pantry",
      "tall-oven-tower",
      "tall-fridge-housing",
    ]) {
      expect(entryAt(700, buildId).nominalDepthMm).toBe(660);
      expect(finishedDepthMmOf(entryAt(700, buildId))).toBe(
        finishedDepthMmOf(entryAt(600, buildId)) + 100,
      );
    }
  });

  // **The split.** The tower's finished depth moves by the same 100 the pantry's does, and the gap
  // between them — the oven's and the microwave's own fascias and bars — is the same 39 mm at both
  // depths. A wave that had scaled the appliances with the setting would move the tower by more; one
  // that had pinned the whole body would move it by nothing. Both are excluded here.
  it("keeps the appliance fronts a manufactured size at both depths", () => {
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(
        finishedDepthMmOf(entryAt(cabinetDepthMm, "tall-oven-tower")) -
          finishedDepthMmOf(entryAt(cabinetDepthMm, "tall-pantry")),
      ).toBe(39);
    }
  });

  it("leaves the freestanding fridge alone, because it is a machine and not a carcass", () => {
    for (const buildId of ["fridge-free"]) {
      expect(entryAt(700, buildId).nominalDepthMm).toBe(
        entryAt(600, buildId).nominalDepthMm,
      );
      expect(finishedDepthMmOf(entryAt(700, buildId))).toBe(
        finishedDepthMmOf(entryAt(600, buildId)),
      );
    }
  });
});

describe("wave 6I: an entry that neither tracks the setting nor declares an exception fails", () => {
  // ADR 0058 decisions 2 and 3. The pin on the two deliberately deep top cabinets has to be a
  // **declaration**, because a constant that has silently stopped tracking anything and a body that
  // was deliberately held still are indistinguishable once the person who wrote it has gone — which
  // is exactly what `BASE_DEPTH_MM` (6H) and `COLUMN_DEPTH_MM` (this wave) turned out to be.
  //
  // The two entries ADR 0058 names are **seeded**, so the falsifiable form over them lives with the
  // seeded catalogue. What is asserted here is the mechanism they will use, over the §7 population:
  // every entry declares, the declaration and the measured movement agree, and an entry that
  // declares nothing is refused rather than read as pinned.
  const ENTRIES_AT_600 = buildInsertableBodyDefinitions(600);

  it.each(ENTRIES_AT_600.map(([buildId]) => buildId))(
    "%s declares whether its depth follows the setting",
    (buildId) => {
      expect(() =>
        cabinetDepthRuleOf({
          buildId,
          rule: entryAt(600, buildId).depthRule,
        }),
      ).not.toThrow();
    },
  );

  it.each(ENTRIES_AT_600.map(([buildId]) => buildId))(
    "%s moves between the two declared depths exactly when it says it does",
    (buildId) => {
      const rule = cabinetDepthRuleOf({
        buildId,
        rule: entryAt(600, buildId).depthRule,
      });
      const moved =
        depthFactsJson(entryAt(700, buildId)) !==
        depthFactsJson(entryAt(600, buildId));

      expect(moved).toBe(depthFollowsSetting(rule));
    },
  );

  it("refuses an entry that declares nothing, naming it", () => {
    expect(() =>
      cabinetDepthRuleOf({ buildId: "invented-row", rule: undefined }),
    ).toThrow(UndeclaredCabinetDepthRuleError);
    expect(() =>
      cabinetDepthRuleOf({ buildId: "invented-row", rule: undefined }),
    ).toThrow(/invented-row/);
  });

  // **And the refusal is wired to something that runs.** The block above proves the function
  // refuses; without this one it could still have been a function nothing production called, which
  // is what the seeded population — whose `depthRule` is optional — needed protecting from. The
  // guard is fed a fabricated undeclared row rather than the shipped map, because the shipped map
  // has no such row and could not grow one without this sweep failing first.
  it("assembles the shipped catalogue at both depths without refusing a row", () => {
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(() => buildKitchenLBodyCatalog(cabinetDepthMm)).not.toThrow();
    }
  });

  it("refuses to assemble a catalogue holding a row that declares nothing", () => {
    expect(() => {
      refuseUndeclaredDepthRules([["undeclared-row", {}]]);
    }).toThrow(UndeclaredCabinetDepthRuleError);
  });

  // The §7 catalogue has no pinned row — the pin lives on two seeded ones — so the arm is exercised
  // directly here as well as over the whole catalogue in the block below.
  it("reads a pin as an exception rather than as a body that happens not to move", () => {
    const pinned = pinnedAtFinishedDepthMm(600, "base-formula");

    expect(depthFollowsSetting(pinned)).toBe(false);
    expect(cabinetDepthRuleOf({ buildId: "pinned-row", rule: pinned })).toEqual(
      {
        follows: "pinned",
        pinnedFinishedDepthMm: 600,
        alongWallPositionFollows: "base-formula",
      },
    );
  });
});

describe("wave 6J: along-wall depth chains are catalogue declarations", () => {
  function chainOf(buildId: string) {
    const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
    return cabinetDepthRuleOf({
      buildId,
      rule: definition?.depthRule,
    }).alongWallPositionFollows;
  }

  it("puts only the structural wall returns on the wall-map chain", () => {
    expect(chainOf("wall-corner-return-570")).toBe("wall-map");
    expect(chainOf("wall-corner-return-570-top")).toBe("wall-map");
    expect(chainOf("wall-2door-600")).toBe("base-formula");
    expect(chainOf("fridge-free-700")).toBe("base-formula");
    expect(chainOf("wall-2door-700-over-fridge")).toBe("base-formula");
  });

  it("refuses a depth rule that omits the position chain", () => {
    expect(() =>
      cabinetDepthRuleOf({
        buildId: "legacy-rule",
        rule: { follows: "cabinet-depth" } as never,
      }),
    ).toThrow(UndeclaredCabinetDepthRuleError);
  });
});

describe("an undeclared cabinet depth refuses to build a catalogue at all", () => {
  it("enforces the dishwasher-derived 520 mm floor in the domain", () => {
    expect(MIN_CABINET_DEPTH_MM).toBe(520);
    expect(() => requireDeclaredCabinetDepthMm(519)).toThrow(
      CabinetDepthBelowMinimumError,
    );
    expect(requireDeclaredCabinetDepthMm(600)).toBe(600);
    expect(requireDeclaredCabinetDepthMm(700)).toBe(700);
  });

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

describe("ADR 0058: the two deep top cabinets are pinned, over the whole catalogue", () => {
  // **Decision 3's falsifiable form, verbatim:** build the catalogue at 600 and at 700; these two
  // entries' finished depth is identical (600) at both, while every other cabinetry entry's has
  // moved. Both populations are in it, which is what wave 6I had to make possible — until it, the
  // seeded map was a module constant with no depth to be built at, so the two rows the decision is
  // about could not be asked the question.
  const PINNED_BUILD_IDS = [
    "wall-2door-600-deep-top",
    "wall-2door-700-over-fridge",
  ];

  function entryOf(cabinetDepthMm: number, buildId: string): BodyDefinition {
    const catalogue: BodyCatalog = buildKitchenLBodyCatalog(cabinetDepthMm);
    const definition = catalogue.get(buildId);
    if (!definition) throw new Error(`no entry "${buildId}"`);
    return definition;
  }

  /** How far this body's finished front stands from the wall plane. A `wall-plane` rule states it
   *  outright; a `recorded-shell` rule states only what stands in front of the seat, so the seat has
   *  to be added back. Both arms are needed: the two pinned rows are fronted top carcasses and most
   *  of the catalogue is not. */
  function finishedDepthMm(definition: BodyDefinition): number {
    return definition.occupiedDepth.measuredFrom === "wall-plane"
      ? definition.occupiedDepth.finishedDepthMm
      : definition.frameDepthMm + definition.occupiedDepth.frontAssemblyMm;
  }

  it.each(PINNED_BUILD_IDS)(
    "%s finishes at 600 at both declared depths",
    (buildId) => {
      for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
        expect(finishedDepthMm(entryOf(cabinetDepthMm, buildId))).toBe(600);
      }
    },
  );

  it("declares the pin rather than holding still by arithmetic", () => {
    for (const buildId of PINNED_BUILD_IDS) {
      expect(entryOf(700, buildId).depthRule).toEqual({
        follows: "pinned",
        pinnedFinishedDepthMm: 600,
        alongWallPositionFollows: "base-formula",
      });
    }
  });

  // The other half of decision 3, and the half that makes the first non-vacuous: everything that is
  // not pinned and not a machine **has** moved. Without it the pin would be satisfied just as well
  // by a catalogue in which nothing moved at all — which is the state wave 6I found the seeded map
  // in, and the reason the decision insists the pin be a declaration.
  it("has moved every other cabinetry entry, in both populations", () => {
    const rows = [...buildKitchenLBodyCatalog(600).keys()].map((buildId) => {
      const rule = cabinetDepthRuleOf({
        buildId,
        rule: entryOf(600, buildId).depthRule,
      });
      const moved =
        depthFactsJson(entryOf(700, buildId)) !==
        depthFactsJson(entryOf(600, buildId));
      return { buildId, moved, follows: depthFollowsSetting(rule) };
    });

    // Guards the sweep itself: a catalogue that somehow answered "nothing moved" for everything
    // would satisfy the per-row check below trivially.
    expect(rows.filter((row) => row.moved).length).toBeGreaterThan(20);
    expect(rows.filter((row) => !row.moved).map((row) => row.buildId)).toEqual([
      "fridge-free-700",
      "wall-2door-600-deep-top",
      "wall-2door-700-over-fridge",
      "fridge-free",
    ]);
    for (const row of rows) {
      expect({ buildId: row.buildId, moved: row.moved }).toEqual({
        buildId: row.buildId,
        moved: row.follows,
      });
    }
  });

  // Criterion 3's loud-failure clause over the population it is about: an entry that neither tracks
  // the setting nor declares an exception is refused rather than silently read as pinned.
  it.each([...KITCHEN_L_BODY_CATALOG.keys()])(
    "%s declares whether its depth follows the setting",
    (buildId) => {
      expect(() =>
        cabinetDepthRuleOf({
          buildId,
          rule: entryOf(600, buildId).depthRule,
        }),
      ).not.toThrow();
    },
  );
});
