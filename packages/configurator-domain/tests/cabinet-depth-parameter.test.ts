// The cabinet depth is a parameter, not a module constant: the 600 mm build is checked against a table of today's
// shipped numbers written here as data (a test reading its values from the module it checks proves nothing), and a
// catalogue built at 700 must describe a different kitchen (ADR 0036 decision 5).
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

/** Every depth-bearing field of the shipped catalogue at the declared 600 mm, transcribed as data: the entry's
 *  nominal, the `frameDepthMm` fallback `void-engine.ts` seats an unmeasured placement from, and the finished depth
 *  its `occupiedDepth` rule declares (or the front assembly, for wall carcasses whose depth is a placement variable).
 *  None may move; exact equality is stricter than M1's 1e-6 m parity gate. */
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
  // `frameDepthMm` is 291 for the two fronted wall rows (ADR 0075 decision 1): the field is twice the rear overhang
  // (ADR 0018) and `wallCabinet` builds `D − 39` centred on z = 0, so 330 declared − 39 front assembly = 291 shell.
  // The nominal stays 330, what §7 declares and the customer is told (ADR 0036 decision 1). The field is only
  // `deriveFrame`'s fallback for a placement with no measured seat; no builder reads it.
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

/** Every depth-bearing field of one entry as one comparable value: "moved" needs all three, since a fronted wall
 *  carcass declares the same `+39` rule at both depths and the setting moves the shell it is measured from. */
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
});

describe("a catalogue built at 700 describes a different kitchen", () => {
  // ADR 0036 decision 5: the falsifiable form of "no module-level constant fixes these at 600" is that the same
  // build function, given 700, answers differently.
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

  // A base entry's `nominalDepthMm` must follow the setting: a literal `BASE_DEPTH_MM` once left a body finishing at
  // 720 on a 580 mm seat at 700 (§11 row 19). Both numbers are measured on the built meshes by
  // `occupied-depth.parity.test.ts`; they are written here as data.
  it("moves the base seat with the setting, which 6H left as a literal", () => {
    expect(entryAt(600, "base-cabinet").nominalDepthMm).toBe(580);
    expect(entryAt(700, "base-cabinet").nominalDepthMm).toBe(680);
  });
});

describe("wave 6I: every base-band body follows the formula, not just `baseCabinet`", () => {
  // The corner, return, dishwasher and oven-tower bodies must each move by the amount the formula moves
  // `baseCabinet`; the mesh-backed half is `occupied-depth.parity.test.ts` in `@lemnaria/three-adapter`.
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

  // The shift being 100 stops "they all agree" being satisfied by nothing moving at all.
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
  // Each body states which of the two it is, and a test asserts the split rather than everything moving together.
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

  // The tower's finished depth moves by the same 100 the pantry's does, and the gap between them (the oven's and
  // microwave's fascias and bars) is 39 mm at both depths: scaling the appliances would move it by more, pinning the
  // body by nothing.
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
  // ADR 0058 decisions 2 and 3: a pin must be a declaration, since a constant that stopped tracking anything and a
  // body deliberately held still are indistinguishable later. The entries ADR 0058 names are seeded, so this asserts
  // the mechanism over the §7 population: every entry declares, declaration and measured movement agree, and an
  // undeclared entry is refused rather than read as pinned.
  const ENTRIES_AT_600 = buildInsertableBodyDefinitions(600);

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

  // The refusal must be wired to something that runs: the guard is fed a fabricated undeclared row, because the
  // shipped map has none and could not grow one without this sweep failing first.
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

  // No shipped row declares a pin since ADR 0101, so this suite declares its own (ADR 0093 decision 2): delete the
  // `pinned` case from `depthFollowsSetting` or `cabinetDepthRuleOf` and this goes red; nothing in the seeded kitchen
  // would.
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

  // ADR 0028 decision 4: wall depths are manufactured sizes, so a missing row is a programming error. 650 would
  // interpolate to 372 and 800 extrapolate to 500, a plausible future row and not a commitment.
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
  // ADR 0039 decisions 1 and 2, asserted at both depths so the growing gap cannot later be fixed by putting the hood
  // back on the depth map: a hood is sized to its cooktop and hung at the front.
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

  it("seats it from the front at both depths, as twice its rear overhang", () => {
    // ADR 0018: `frameDepthMm` is not a depth. §11 row 19's second named exception.
    for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
      expect(entryAt(cabinetDepthMm, "hood").frameDepthMm).toBe(
        2 * cabinetDepthMm - HOOD_BODY_DEPTH_MM,
      );
    }
  });
});

describe("ADR 0101: the deep top cabinets follow the setting, over the whole catalogue", () => {
  // ADR 0101 withdrew the pin on these two rows: their depth is `columnBuildDepthMm`'s lifted arm (they hang over
  // full-height columns), so it is the cabinet-depth line at every setting. A row that declares an exception still
  // must not move; `fridge-free-700` carries that now (ADR 0058 decision 3).
  const DEEP_TOP_BUILD_IDS = [
    "wall-2door-600-deep-top",
    "wall-2door-700-over-fridge",
  ];

  function entryOf(cabinetDepthMm: number, buildId: string): BodyDefinition {
    const catalogue: BodyCatalog = buildKitchenLBodyCatalog(cabinetDepthMm);
    const definition = catalogue.get(buildId);
    if (!definition) throw new Error(`no entry "${buildId}"`);
    return definition;
  }

  /** How far this body's finished front stands from the wall plane: a `wall-plane` rule states it, a `recorded-shell`
   *  rule states only what stands in front of the seat, so the seat is added back. Both arms are needed. */
  function finishedDepthMm(definition: BodyDefinition): number {
    return definition.occupiedDepth.measuredFrom === "wall-plane"
      ? definition.occupiedDepth.finishedDepthMm
      : definition.frameDepthMm + definition.occupiedDepth.frontAssemblyMm;
  }

  it.each(DEEP_TOP_BUILD_IDS)(
    "%s finishes at the cabinet-depth line at both declared depths",
    (buildId) => {
      for (const cabinetDepthMm of DECLARED_DEPTHS_MM) {
        // Compared against `columnBuildDepthMm`'s lifted arm, not a literal 600/700 pair, so a third declared depth
        // needs no edit here (ADR 0101).
        expect(finishedDepthMm(entryOf(cabinetDepthMm, buildId))).toBe(
          columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder: true }),
        );
      }
    },
  );

  it("declares that a lifted column answers its depth, rather than being deep by arithmetic", () => {
    for (const buildId of DEEP_TOP_BUILD_IDS) {
      const entry = entryOf(700, buildId);

      expect(entry.depthRule).toEqual({
        follows: "cabinet-depth",
        alongWallPositionFollows: "base-formula",
      });
      // ADR 0101 decision 1: the equivalence gate reads this off the entry, never its name or number.
      expect(entry.builtDepthFollowsALiftedColumn).toBe(true);
    }
  });

  // The other half of ADR 0058 decision 3: everything that is not a machine has moved, else the exception would be
  // satisfied by a catalogue in which nothing moved.
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
