// **Adversarial QA for wave 6Q-b's load half.** Written to falsify, not to confirm.
//
// The wave's central claim is that `PLACEMENT_WEARS_UNOFFERED_FINISH` is unreachable on the load
// path **by construction** — so a single stored document that a load refuses makes the claim false
// and turns a `/d/{id}` share link into a dead one (ADR 0052). The shipped suite sweeps that claim
// at `CURRENT_SCHEMA_VERSION` only; this file sweeps it at **every supported version**, over every
// shape of unoffered finish the schema admits, and adds the questions the shipped suite does not
// ask: does a load ever write, is the resolution a fixed point through a real JSON round trip, and
// can the reset ever land on a value that is neither the declaration's default nor the one already
// worn.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type { Design } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_MATERIAL_ID,
  materialById,
  materialOffersFinish,
  MATERIALS,
  PALETTE_ENTRIES,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import {
  validateDesignForCatalog,
  fatalDesignValidationIssues,
} from "../src/validate-design.js";
import { declaredCabinetDepthsMm } from "../src/worktop-depth.js";
import {
  freeColourPairArbitrary,
  PALETTE_PAIRS,
} from "./support/material-finish-pairs.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** A body the catalogue says can wear a finish, and one it says cannot. */
const FINISHABLE_ID = "p0";
const FRONTLESS_ID = "p13";

/** Shape-valid, declared by no material — ADR 0072's reachable recovery state. */
const UNDECLARED_TIER_ID = "material.laminate";

/** Every supported version, written out rather than derived, so a bump that widens the range has to
 *  come here and say so. */
const EVERY_SUPPORTED_VERSION = [1, 2, 3, 4, 5] as const;

function storedDocument(options: {
  readonly finish?: Finish;
  readonly onId?: string;
  readonly materialTierId?: string;
}): Design {
  const onId = options.onId ?? FINISHABLE_ID;
  const settings =
    options.materialTierId === undefined
      ? KITCHEN_L_DESIGN.settings
      : {
          ...KITCHEN_L_DESIGN.settings,
          materialTierId: options.materialTierId,
        };
  return {
    ...KITCHEN_L_DESIGN,
    settings,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === onId && options.finish
        ? { ...placement, body: { ...placement.body, finish: options.finish } }
        : placement,
    ),
  };
}

/** The row as the repository actually hands it over: JSON, at a stated version. */
function loadAt(version: number, design: Design): Design {
  return migrateDesign(
    version,
    JSON.parse(JSON.stringify(design)) as unknown,
    CATALOG,
  );
}

function finishOn(design: Design, id: string): Finish | undefined {
  return design.placements.find((placement) => placement.id === id)?.body
    .finish;
}

function bareIds(design: Design): readonly string[] {
  return design.placements
    .filter((placement) => placement.body.finish === undefined)
    .map((placement) => placement.id);
}

/** The property in the phrasing a helpful resolution cannot pass: **every finish a placement
 *  carries is offered, and every placement carrying none still carries none.** */
function assertInvariantHolds(
  loaded: Design,
  stored: Design,
  materialTierId: string,
): void {
  const material = materialById(materialTierId);
  for (const placement of loaded.placements) {
    const carried = placement.body.finish;
    if (carried === undefined) continue;
    expect({
      id: placement.id,
      offered: materialOffersFinish(material, carried),
    }).toEqual({ id: placement.id, offered: true });
  }
  expect(bareIds(loaded)).toEqual(bareIds(stored));
}

// **Attack 1 — the unreachability claim, at every version rather than at the current one.**
//
// A refusal reachable at version 3 is exactly as dead a link as one reachable at version 5, and the
// shipped sweep only ever passes `CURRENT_SCHEMA_VERSION`.
describe("no stored document is refused for its finish, at any supported version", () => {
  function assertLoadsClean(version: number, stored: Design): void {
    const loaded = loadAt(version, stored);
    expect(
      fatalDesignValidationIssues(validateDesignForCatalog(loaded, CATALOG)),
    ).toEqual([]);
  }

  it("holds for every material against every declared palette entry, at every version", () => {
    expect(PALETTE_PAIRS.length).toBe(
      MATERIALS.length * PALETTE_ENTRIES.length,
    );
    expect(EVERY_SUPPORTED_VERSION).toHaveLength(CURRENT_SCHEMA_VERSION);

    for (const version of EVERY_SUPPORTED_VERSION) {
      for (const pair of PALETTE_PAIRS) {
        assertLoadsClean(
          version,
          storedDocument({
            finish: pair.finish,
            materialTierId: pair.material.materialId,
          }),
        );
      }
    }
  });

  it("holds for a free colour on every material, at every version", () => {
    fc.assert(
      fc.property(
        freeColourPairArbitrary(),
        fc.constantFrom(...EVERY_SUPPORTED_VERSION),
        (pair, version) => {
          assertLoadsClean(
            version,
            storedDocument({
              finish: pair.finish,
              materialTierId: pair.material.materialId,
            }),
          );
        },
      ),
    );
  });

  it("holds for a finish on a frontless body, at every version and every material", () => {
    for (const version of EVERY_SUPPORTED_VERSION) {
      for (const material of MATERIALS) {
        assertLoadsClean(
          version,
          storedDocument({
            finish: paletteFinish("pal.alb"),
            onId: FRONTLESS_ID,
            materialTierId: material.materialId,
          }),
        );
      }
    }
  });

  it("holds for a document whose material id names no declared material", () => {
    for (const version of EVERY_SUPPORTED_VERSION) {
      assertLoadsClean(
        version,
        storedDocument({
          finish: paletteFinish("veneer.nuc"),
          materialTierId: UNDECLARED_TIER_ID,
        }),
      );
    }
  });

  it("holds for a document carrying no materialTierId at all", () => {
    for (const version of EVERY_SUPPORTED_VERSION) {
      for (const pair of PALETTE_PAIRS) {
        assertLoadsClean(version, storedDocument({ finish: pair.finish }));
      }
    }
  });
});

// **Attack 2 — the normalisation is keyed at no version, including the version this build writes.**
//
// 6P's QA measured what keying an unconditional property at a version costs: the strip never ran on
// documents the build itself was writing. The measurement that catches that regression is not "it
// runs" but "it runs *and changed something*" at each version — a version-keyed arm would show up
// here as a version at which nothing moved.
describe("the resolution runs at every version, including the one this build writes", () => {
  it("rewrites an unoffered finish at each of versions 1 through 5", () => {
    const veneerDefault = materialById("material.veneer").defaultFinish;
    const resolvedAt = new Map<number, boolean>();

    for (const version of EVERY_SUPPORTED_VERSION) {
      const stored = storedDocument({
        finish: paletteFinish("pal.antracit"),
        materialTierId: "material.veneer",
      });
      const carried = finishOn(loadAt(version, stored), FINISHABLE_ID);
      resolvedAt.set(
        version,
        Boolean(carried && sameFinish(carried, veneerDefault)),
      );
    }

    expect([...resolvedAt.entries()]).toEqual(
      EVERY_SUPPORTED_VERSION.map((version) => [version, true]),
    );
  });

  it("rewrites a free colour on a decor-list kitchen at each version too", () => {
    for (const version of EVERY_SUPPORTED_VERSION) {
      const stored = storedDocument({
        finish: { kind: "free-colour", value: "#8d9a84" },
        materialTierId: DEFAULT_MATERIAL_ID,
      });

      expect(finishOn(loadAt(version, stored), FINISHABLE_ID)).toEqual(
        materialById(DEFAULT_MATERIAL_ID).defaultFinish,
      );
    }
  });
});

// **Attack 3 — the reset target, and the forbidden alternative** (ADR 0078 decision 4).
//
// The naive assertion "the resolved finish is offered" cannot see a nearest-colour mapping: a free
// colour built from a decor's swatch hex is offered by MDF. What catches it is the closed set: a
// carried finish is either the one that was stored or the declaration's own default, and nothing
// else exists.
describe("the load seam produces only the declared default or the finish already worn", () => {
  function assertTargetIsClosed(stored: Design, materialTierId: string): void {
    const material = materialById(materialTierId);
    const loaded = loadAt(CURRENT_SCHEMA_VERSION, stored);

    for (const [index, placement] of loaded.placements.entries()) {
      const carried = placement.body.finish;
      if (carried === undefined) continue;
      const wasWearing = stored.placements[index]?.body.finish;
      const isDeclaredDefault = sameFinish(carried, material.defaultFinish);
      const isUnchanged =
        wasWearing !== undefined && sameFinish(carried, wasWearing);
      expect({
        id: placement.id,
        landedSomewhereDeclared: isDeclaredDefault || isUnchanged,
      }).toEqual({ id: placement.id, landedSomewhereDeclared: true });
    }
  }

  it("holds over every declared pair", () => {
    for (const pair of PALETTE_PAIRS) {
      assertTargetIsClosed(
        storedDocument({
          finish: pair.finish,
          materialTierId: pair.material.materialId,
        }),
        pair.material.materialId,
      );
    }
  });

  it("holds over a generated free colour on every material", () => {
    fc.assert(
      fc.property(freeColourPairArbitrary(), (pair) => {
        assertTargetIsClosed(
          storedDocument({
            finish: pair.finish,
            materialTierId: pair.material.materialId,
          }),
          pair.material.materialId,
        );
      }),
    );
  });

  // The anti-invariant stated the strong way, over the same generated pair space: a resolution that
  // filled defaults onto the fourteen bare bodies satisfies "every placement's finish is offered".
  it("leaves every bare placement bare, over the whole pair space", () => {
    for (const pair of PALETTE_PAIRS) {
      const stored = storedDocument({
        finish: pair.finish,
        materialTierId: pair.material.materialId,
      });
      expect(bareIds(stored).length).toBeGreaterThan(0);
      assertInvariantHolds(
        loadAt(CURRENT_SCHEMA_VERSION, stored),
        stored,
        pair.material.materialId,
      );
    }
  });
});

// **Attack 4 — does a load ever write, and is the second load the same as the first?**
//
// ADR 0055's line is that a rewrite of stored values owes a version bump; this wave takes none, on
// the argument that the resolution is a fixed point. That argument is only worth what a real JSON
// round trip says about it, and `updatedAt` is what a save is diffed on.
describe("a load is idempotent through a real round trip and never moves the clock", () => {
  it("gives a byte-identical document on the second load, for every pair", () => {
    for (const pair of PALETTE_PAIRS) {
      const stored = storedDocument({
        finish: pair.finish,
        materialTierId: pair.material.materialId,
      });
      const once = loadAt(CURRENT_SCHEMA_VERSION, stored);
      const twice = loadAt(CURRENT_SCHEMA_VERSION, once);

      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    }
  });

  it("never moves updatedAt, whether or not it resolved anything", () => {
    for (const pair of PALETTE_PAIRS) {
      const stored = storedDocument({
        finish: pair.finish,
        materialTierId: pair.material.materialId,
      });
      const loaded = loadAt(CURRENT_SCHEMA_VERSION, stored);

      expect(loaded.updatedAt).toBe(stored.updatedAt);
      expect(loaded.createdAt).toBe(stored.createdAt);
    }
  });

  // The *"returned by identity when nothing is owed"* claim in both normalisations' head comments is
  // not observable at `migrateDesign`'s boundary — `LegacyDesignSchema.safeParse` rebuilds the whole
  // object graph before either of them runs, so the returned array is never the caller's. What is
  // observable, and what the claim is actually protecting, is that a second load is deep-equal to the
  // first for every pair *and* at every version, which is asserted here rather than at one version.
  it("is a fixed point at every supported version, for every pair", () => {
    for (const version of EVERY_SUPPORTED_VERSION) {
      for (const pair of PALETTE_PAIRS) {
        const once = loadAt(
          version,
          storedDocument({
            finish: pair.finish,
            materialTierId: pair.material.materialId,
          }),
        );

        expect(loadAt(CURRENT_SCHEMA_VERSION, once)).toEqual(once);
      }
    }
  });

  it("is a fixed point on a document whose frontless body was stripped", () => {
    const once = loadAt(
      CURRENT_SCHEMA_VERSION,
      storedDocument({
        finish: paletteFinish("pal.alb"),
        onId: FRONTLESS_ID,
        materialTierId: "material.veneer",
      }),
    );

    expect(loadAt(CURRENT_SCHEMA_VERSION, once)).toEqual(once);
  });
});

// **Attack 5 — the reachability discharge's own premise.**
//
// ADR 0084 decision 1 ends with *"`canFinish` is depth-invariant in the catalogue, so the two-depth
// `catalogAt` factory cannot flip a body into or out of the strip's reach."* That is a claim about
// the catalogue builder, asserted nowhere in the wave's suite, and it is the sentence the whole
// count-of-2 argument rests on.
describe("canFinish is depth-invariant, which the discharge depends on", () => {
  it("answers the same for every build id at every declared cabinet depth", () => {
    const depths = declaredCabinetDepthsMm();
    expect(depths.length).toBeGreaterThan(1);

    const reference = buildKitchenLBodyCatalog(depths[0] ?? 600);
    for (const depth of depths.slice(1)) {
      const catalog = buildKitchenLBodyCatalog(depth);
      for (const [buildId, record] of reference) {
        expect({
          buildId,
          depth,
          canFinish: catalog.get(buildId)?.canFinish,
        }).toEqual({
          buildId,
          depth,
          canFinish: record.canFinish,
        });
      }
      expect([...catalog.keys()].sort()).toEqual([...reference.keys()].sort());
    }
  });

  it("strips a frontless body at every declared depth, so the load seam's guarantee is depth-free", () => {
    for (const depth of declaredCabinetDepthsMm()) {
      const catalog = buildKitchenLBodyCatalog(depth);
      const stored: Design = {
        ...storedDocument({
          finish: paletteFinish("pal.alb"),
          onId: FRONTLESS_ID,
          materialTierId: "material.veneer",
        }),
        settings: {
          ...KITCHEN_L_DESIGN.settings,
          cabinetDepthMm: depth,
          materialTierId: "material.veneer",
        },
      };

      const loaded = migrateDesign(
        CURRENT_SCHEMA_VERSION,
        JSON.parse(JSON.stringify(stored)) as unknown,
        catalog,
      );

      expect(finishOn(loaded, FRONTLESS_ID)).toBeUndefined();
    }
  });
});

// **Attack 6 — the new refusal code is a *fatal* code, and one migration arm used to read fatal
// codes as a decision input.** Adjudicated by [ADR 0085](../../../docs/decisions/0085-a-normalisations-guard-asks-what-the-normalisation-changes.md);
// the assertions below are unchanged from the day they were written red.
//
// **What this measured when it was written.** `correctPreCorrectionRoom` asked
// `hasFatalIssues(corrected, catalog)` and **declined the room correction** when the corrected
// document carried any fatal finding at all. `PLACEMENT_WEARS_UNOFFERED_FINISH` joined the severity
// table in this wave, and that question was asked at version ≤ 2 — *before*
// `resolveFinishesTheMaterialDoesNotOffer` runs — so a version 1 or 2 document wearing an unoffered
// finish answered "yes, fatal" for a reason with no bearing on its room and loaded carrying the room
// the correction of 2026-09-03 exists to replace. Measured: `widthMm` came back 3600 with the
// finish and 3560 without it.
//
// **What settled it.** ADR 0085 decision 2 makes the guard a comparison — it declines only when the
// correction *creates* a fatal finding the stored document did not carry, by `(code, path)` — so a
// finding identical under both rooms can no longer reach it. `hasFatalIssues` is gone with its only
// caller; `createsAFatalFinding` in `migrate-design.ts` is what runs now, and
// `qa-0085-normalisation-guard.adversarial.test.ts` is the sweep over the guard itself.
//
// The defect was the failure mode `NORMALISATIONS_BY_VERSION_OWING_THEM`'s own head comment records
// as *"one defect has already turned on it"*, arriving from the other direction.
describe("the new fatal code and the room correction", () => {
  const preCorrectionRoom = {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  } as const;
  const CORRECTED_WIDTH_MM = 3560;

  function preCorrectionDocument(finish: Finish | undefined): Design {
    return {
      ...KITCHEN_L_DESIGN,
      room: preCorrectionRoom,
      settings: {
        ...KITCHEN_L_DESIGN.settings,
        materialTierId: "material.veneer",
      },
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === FINISHABLE_ID && finish
          ? { ...placement, body: { ...placement.body, finish } }
          : placement,
      ),
    };
  }

  it("corrects the room on a version 2 document wearing nothing", () => {
    const loaded = loadAt(2, preCorrectionDocument(undefined));

    expect(loaded.room.widthMm).toBe(CORRECTED_WIDTH_MM);
  });

  // **The finding itself, written red and now green under ADR 0085 decision 2.** Same document, one
  // cabinet wearing a PAL decor on a veneer kitchen — a finish
  // `resolveFinishesTheMaterialDoesNotOffer` rewrites to `veneer.stejar` two lines later — so the
  // room correction used to decline silently and hand back 3600.
  //
  // **Reachability, stated honestly, because it is why this was a contract gap and not an outage.**
  // No row in the database was believed to be in this class: `settings.materialTierId` was not
  // written at schema version ≤ 2, and a version ≤ 2 document's finishes are legacy enum strings,
  // every one of which `carriedForwardFrom` maps to a decor PAL offers. The coupling was **latent**
  // rather than a live dead room. It was left failing anyway, because the wave's safety argument is
  // *"the refusal is unreachable on the load path by construction"* and the code's **fatality** was
  // in fact consumed on the load path, one arm before the resolution that was supposed to make it
  // moot — the load seam's contract is every document `LegacyDesignSchema` admits at a supported
  // version, and this fixture is one.
  it("corrects the room on the same document wearing a finish its material does not offer", () => {
    const loaded = loadAt(
      2,
      preCorrectionDocument(paletteFinish("pal.antracit")),
    );

    expect(loaded.room.widthMm).toBe(CORRECTED_WIDTH_MM);
  });

  /** The room the correction actually produces, measured off a load rather than restated, so wave
   *  6N-0's change to `CORRECTED_ROOM_MM.depthMm` arrives here as a new measurement instead of
   *  leaving a literal that still passes while no longer naming the room under test. */
  const CORRECTED_ROOM = loadAt(2, preCorrectionDocument(undefined)).room;

  // The mechanism, so the finding is not read as a room bug: under the corrected room the only fatal
  // finding is this wave's new code, and it is what the guard used to read as "do not correct".
  it("names this wave's code as the only fatal finding under the corrected room", () => {
    const corrected: Design = {
      ...preCorrectionDocument(paletteFinish("pal.antracit")),
      room: CORRECTED_ROOM,
    };

    expect(
      fatalDesignValidationIssues(
        validateDesignForCatalog(corrected, CATALOG),
      ).map((issue) => issue.code),
    ).toEqual(["PLACEMENT_WEARS_UNOFFERED_FINISH"]);
  });
});
