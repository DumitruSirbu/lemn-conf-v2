// **A document written under the shipped five-value finish enum loads.** Wave 6P, ADR 0071
// decision 5, and the owner's ruling of 2026-09-04 on which of two losses it takes.
//
// ADR 0052's precedent governs the shape of the answer: a document written under a superseded rule
// is normalised rather than refused, because a `/d/{id}` share link is the one artefact this project
// hands to someone who cannot be asked to reload it. **A load that refuses is a link that is dead.**
//
// Asserted **per legacy value**, not on one fixture that happens to carry two of them: the five
// names were retired for two different reasons — three narrow onto a PAL decor, two stop being
// offered on a PAL kitchen at all — and a sweep over one fixture would have covered whichever pair
// the fixture's author reached for.
import { describe, expect, it } from "vitest";

import type { Design } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  DEFAULT_FINISH,
  LEGACY_ENUM_FINISH_NAMES,
  LEGACY_ENUM_FINISHES,
  paletteFinish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { InvalidDesignError } from "../src/repository.js";

/** A finishable seeded body, and the three the catalogue declares `canFinish: false` on. */
const FINISHABLE_ID = "p0";
const UNFINISHABLE_IDS = ["p7", "p12", "p13"] as const;

/** Every version this build still carries a document forward from. It writes
 *  `CURRENT_SCHEMA_VERSION`, which is 5.
 *
 *  **Version 4 is in this list and is not decoration.** It is the arm wave 6J-a added — a document
 *  that already carries a cabinet depth and may still carry a legacy string finish, because the two
 *  waves landed one after the other. Without it, re-keying the raw map's `4` to `3` turns every row
 *  6J-a wrote into a dead link with the whole suite still green. */
const LEGACY_VERSIONS = [1, 2, 3, 4] as const;

/** The stored document as JSON, which is the only form a migration ever meets: `migrateDesign`
 *  takes `unknown`, and a legacy finish is a *string* the current schema cannot express, so it
 *  cannot be written through the `Design` type at all. */
function storedWithFinishes(
  finishByPlacementId: Readonly<Record<string, string>>,
): unknown {
  return JSON.parse(
    JSON.stringify({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) => {
        const finish = finishByPlacementId[placement.id];
        return finish === undefined
          ? placement
          : { ...placement, body: { ...placement.body, finish } };
      }),
    }),
  );
}

/** The stored document with an explicit cabinet depth on it — what a version 4 row actually holds,
 *  since 6J-a wrote the setting before 6P changed the finish shape. */
function withStoredCabinetDepth(stored: unknown): unknown {
  const document = stored as Record<string, unknown>;
  return {
    ...document,
    settings: { ...(document["settings"] as object), cabinetDepthMm: 600 },
  };
}

function finishOf(design: Design, placementId: string) {
  return design.placements.find((placement) => placement.id === placementId)
    ?.body.finish;
}

function reserialised(design: Design): unknown {
  return JSON.parse(JSON.stringify(design));
}

describe("a document holding any of the five legacy finishes loads", () => {
  // **The criterion, per value.** `white` -> PAL *Alb*, `graphite` -> PAL *Antracit*, `oak` -> a
  // *Stejar* are direct palette mappings; only `clay` and `sage` reset, because ADR 0071 decision 5
  // narrows them out of every palette and the owner's ruling of 2026-09-04 — scoped by its own title
  // to those two — keeps the document on PAL rather than deeming it MDF. A migration that reset all
  // five would render an anthracite kitchen white on a link the customer has already shared.
  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "carries %s forward to the finish the declaration names for it",
    (name) => {
      const declared = LEGACY_ENUM_FINISHES[name];

      const loaded = migrateDesign(
        3,
        storedWithFinishes({ [FINISHABLE_ID]: name }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, FINISHABLE_ID)).toEqual(
        declared.kind === "palette-entry" ? declared : DEFAULT_FINISH,
      );
    },
  );

  // The premise the sweep above rests on: the declaration really does distinguish the two arms, so
  // the test cannot quietly become "every value resets" again.
  it("declares three of the five as palette entries and two as free colours", () => {
    const byKind = LEGACY_ENUM_FINISH_NAMES.map(
      (name) => LEGACY_ENUM_FINISHES[name].kind,
    );

    expect(byKind.filter((kind) => kind === "palette-entry")).toHaveLength(3);
    expect(byKind.filter((kind) => kind === "free-colour")).toHaveLength(2);
    expect(LEGACY_ENUM_FINISHES.graphite).not.toEqual(DEFAULT_FINISH);
  });

  it.each(LEGACY_ENUM_FINISH_NAMES)(
    "leaves %s on PAL rather than deeming the document to be MDF",
    (name) => {
      // The owner's ruling: the colour is lost and the price is not. `clay` and `sage` are the two
      // values that tempt the other answer — MDF is the material that still offers them — and
      // taking it would move a design onto a dearer tier the customer never chose, on a link they
      // have already shared.
      const loaded = migrateDesign(
        3,
        storedWithFinishes({ [FINISHABLE_ID]: name }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(loaded.settings?.materialTierId).toBeUndefined();
      // A free colour is MDF's kind of finish and PAL has no control that produces one, so a
      // migrated document holding one would be a PAL kitchen wearing paint.
      expect(finishOf(loaded, FINISHABLE_ID)?.kind).toBe("palette-entry");
    },
  );

  // Every value on one document, each landing on its own answer — so a migration that treated the
  // five as one class would fail here even if each value passed its own case.
  it("carries every legacy value on one document forward at once", () => {
    const storedNameByPlacementId = {
      p0: "white",
      p1: "clay",
      p2: "sage",
      p4: "graphite",
      p5: "oak",
    } as const;

    const loaded = migrateDesign(
      3,
      storedWithFinishes(storedNameByPlacementId),
      KITCHEN_L_BODY_CATALOG,
    );

    for (const [placementId, name] of Object.entries(storedNameByPlacementId)) {
      const declared = LEGACY_ENUM_FINISHES[name];
      expect(finishOf(loaded, placementId)).toEqual(
        declared.kind === "palette-entry" ? declared : DEFAULT_FINISH,
      );
    }
    // Not a class: the anthracite cabinet and the clay one do not come back wearing the same thing.
    expect(finishOf(loaded, "p4")).not.toEqual(finishOf(loaded, "p1"));
  });

  it.each(LEGACY_VERSIONS)(
    "reaches the finish arm from version %i, not only from the version that owes it",
    (version) => {
      const loaded = migrateDesign(
        version,
        storedWithFinishes({ [FINISHABLE_ID]: "sage" }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, FINISHABLE_ID)).toEqual(DEFAULT_FINISH);
    },
  );

  // The arm 6J-a's own rows land on: a document already carrying a depth, still wearing a string
  // finish. Both halves are asserted on one document, because a version 4 row is exactly where the
  // two waves overlap and nothing else in this file reaches it.
  it("rewrites a version 4 document carrying both a depth and a legacy finish", () => {
    const stored = withStoredCabinetDepth(
      storedWithFinishes({ [FINISHABLE_ID]: "graphite", p1: "sage" }),
    );

    const loaded = migrateDesign(4, stored, KITCHEN_L_BODY_CATALOG);

    expect(loaded.settings?.cabinetDepthMm).toBe(600);
    expect(finishOf(loaded, FINISHABLE_ID)).toEqual(
      LEGACY_ENUM_FINISHES.graphite,
    );
    expect(finishOf(loaded, "p1")).toEqual(DEFAULT_FINISH);
  });

  it("refuses a finish that is neither a legacy name nor a declared value", () => {
    // The other half of "normalise rather than refuse": a document written under a superseded rule
    // is carried forward, and a document carrying a value no rule ever produced is refused at the
    // schema. `chartreuse` was never one of the five.
    expect(() =>
      migrateDesign(
        3,
        storedWithFinishes({ [FINISHABLE_ID]: "chartreuse" }),
        KITCHEN_L_BODY_CATALOG,
      ),
    ).toThrow(InvalidDesignError);
  });

  it("leaves a document carrying no finish exactly as it arrived", () => {
    // A load that changes nothing must not rewrite the object a later save is diffed against.
    const stored = storedWithFinishes({});

    expect(
      reserialised(migrateDesign(3, stored, KITCHEN_L_BODY_CATALOG)),
    ).toEqual(stored);
  });
});

describe("the migration is a fixed point", () => {
  const stored = storedWithFinishes({
    [FINISHABLE_ID]: "sage",
    p12: "oak",
  });

  it.each([...LEGACY_VERSIONS, CURRENT_SCHEMA_VERSION])(
    "returns its own output unchanged when re-run at version %i",
    (version) => {
      const once =
        version === CURRENT_SCHEMA_VERSION
          ? migrateDesign(3, stored, KITCHEN_L_BODY_CATALOG)
          : migrateDesign(version, stored, KITCHEN_L_BODY_CATALOG);
      const twice = migrateDesign(
        version,
        reserialised(once),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(twice).toEqual(once);
    },
  );
});

describe("no migration writes a finish onto a body that cannot wear one", () => {
  it.each(UNFINISHABLE_IDS)(
    "drops a legacy finish stored on %s rather than resetting it to a default",
    (placementId) => {
      // `open-shelf`, `hood` and `fridge-free` declare `canFinish: false`. A normalisation that
      // helpfully fills in PAL's default here has invented a choice nobody made, on a body with no
      // front to wear it.
      expect(
        KITCHEN_L_BODY_CATALOG.get(
          KITCHEN_L_DESIGN.placements.find(
            (placement) => placement.id === placementId,
          )?.body.buildId ?? "",
        )?.canFinish,
      ).toBe(false);

      const loaded = migrateDesign(
        3,
        storedWithFinishes({ [placementId]: "oak" }),
        KITCHEN_L_BODY_CATALOG,
      );

      expect(finishOf(loaded, placementId)).toBeUndefined();
    },
  );

  it("drops a declared finish stored on one too, not only a legacy one", () => {
    // The rule is a property of the loaded document rather than a clause inside the finish rewrite,
    // so it holds for a value written after wave 6P as well.
    const stored = reserialised({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p12"
          ? {
              ...placement,
              body: { ...placement.body, finish: paletteFinish("veneer.nuc") },
            }
          : placement,
      ),
    } as Design);

    const loaded = migrateDesign(3, stored, KITCHEN_L_BODY_CATALOG);

    expect(finishOf(loaded, "p12")).toBeUndefined();
  });

  it("strips one from a document already at the version this build writes", () => {
    // The finding this test exists for: keyed as a version 3 arm, the strip never ran on a version 4
    // document at all — `carryForward` walks up to `CURRENT_SCHEMA_VERSION - 1` — so a row this
    // build itself wrote could hold a finish on a hood, pass the write path (nothing in
    // `validate-design.ts` asks the question) and be persisted with nothing left to remove it.
    const stored = reserialised({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p13"
          ? {
              ...placement,
              body: { ...placement.body, finish: paletteFinish("pal.alb") },
            }
          : placement,
      ),
    } as Design);

    const loaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      stored,
      KITCHEN_L_BODY_CATALOG,
    );

    expect(finishOf(loaded, "p13")).toBeUndefined();
  });

  it("is a fixed point at the current version too", () => {
    const stored = reserialised({
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p12"
          ? {
              ...placement,
              body: { ...placement.body, finish: paletteFinish("veneer.nuc") },
            }
          : placement,
      ),
    } as Design);

    const once = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      stored,
      KITCHEN_L_BODY_CATALOG,
    );
    const twice = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      reserialised(once),
      KITCHEN_L_BODY_CATALOG,
    );

    expect(twice).toEqual(once);
  });

  it("leaves a finishable body's finish alone", () => {
    // Not a vacuous sweep: the strip has to be decided by the catalogue's declaration and not by
    // "drop every finish".
    const loaded = migrateDesign(
      3,
      storedWithFinishes({ [FINISHABLE_ID]: "oak" }),
      KITCHEN_L_BODY_CATALOG,
    );

    expect(finishOf(loaded, FINISHABLE_ID)).toEqual(LEGACY_ENUM_FINISHES.oak);
  });
});
