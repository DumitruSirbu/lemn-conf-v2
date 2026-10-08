// **ADR 0099's precedence, and the guarantee the owner asked for in writing.**
//
// The owner's warning — *"do not remove or overwrite a cabinet's own colour selection when the
// global default changes"* — is the property in the middle of this file rather than a sentence in a
// comment: over a random design and a random legal global colour, every placement that carried a
// finish carries the **byte-identical** finish afterwards, and every placement that carried none
// still carries none.
//
// The assertions are on the **document**, never on a view: a surface that renders the right colour
// out of a document that grew a `finish` key has still converted a following cabinet into an
// overriding one, and the *second* global change would then move nothing.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { countCabinetsWearingAChosenFinish } from "../src/chosen-finishes.js";
import { clearFinish } from "../src/commands/set-appearance.js";
import {
  setGlobalFinish,
  setMaterialTier,
} from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  materialById,
  paletteEntriesOf,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../src/materials.js";
import {
  resolvedDefaultFinishOf,
  resolvedFinishOf,
} from "../src/resolved-finish.js";

const OCCURRED_AT = "2026-09-08T09:00:00.000Z";

const PAL_ALB = paletteFinish("pal.alb");
const PAL_ANTRACIT = paletteFinish("pal.antracit");
const PAL_GRI = paletteFinish("pal.gri-havanna");
const VENEER_STEJAR = paletteFinish("veneer.stejar");
const MDF_WHITE = freeColourFinish("#eceeeb");

/** A design on the named material, carrying the placements it is handed and nothing else changed. */
function designOn(
  materialTierId: string,
  placements: readonly DesignPlacement[],
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [...placements],
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}

/** One placement of the seeded kitchen, with the finish stated or with none at all. */
function placementWearing(
  index: number,
  finish: Finish | undefined,
): DesignPlacement {
  const placement = KITCHEN_L_DESIGN.placements[index];
  if (placement === undefined) throw new Error("seeded fixture is too short");
  const body = { ...placement.body };
  delete body.finish;
  return {
    ...placement,
    body: finish === undefined ? body : { ...body, finish },
  };
}

function withGlobalFinish(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** The first placement of a design built above, which every fixture here gives at least one of. */
function firstPlacementOf(design: Design): DesignPlacement {
  const placement = design.placements[0];
  if (placement === undefined) throw new Error("fixture carries no placement");
  return placement;
}

describe("resolvedFinishOf — ADR 0099 decision 1's three levels", () => {
  it("prefers the cabinet's own colour over the kitchen's and over the material's", () => {
    const design = withGlobalFinish(
      designOn("material.melamine", [placementWearing(0, PAL_ANTRACIT)]),
      PAL_GRI,
    );

    const resolved = resolvedFinishOf(firstPlacementOf(design), design);

    expect(resolved).toEqual(PAL_ANTRACIT);
  });

  it("falls to the kitchen's colour where the cabinet chose none", () => {
    const design = withGlobalFinish(
      designOn("material.melamine", [placementWearing(0, undefined)]),
      PAL_GRI,
    );

    const resolved = resolvedFinishOf(firstPlacementOf(design), design);

    expect(resolved).toEqual(PAL_GRI);
  });

  it("falls to the material's declared default where the kitchen chose none either", () => {
    const design = designOn("material.veneer", [
      placementWearing(0, undefined),
    ]);

    const resolved = resolvedFinishOf(firstPlacementOf(design), design);

    expect(resolved).toEqual(materialById("material.veneer").defaultFinish);
  });

  it("answers absent rather than throwing when the material is undeclared and nothing is chosen", () => {
    const design = designOn("material.gone", [placementWearing(0, undefined)]);

    expect(resolvedFinishOf(firstPlacementOf(design), design)).toBeUndefined();
    expect(resolvedDefaultFinishOf(design)).toBeUndefined();
  });

  it("still resolves an undeclared material's kitchen to the global colour", () => {
    const design = withGlobalFinish(
      designOn("material.gone", [placementWearing(0, undefined)]),
      PAL_GRI,
    );

    expect(resolvedFinishOf(firstPlacementOf(design), design)).toEqual(PAL_GRI);
  });
});

describe("setGlobalFinish — the owner's warning, as a command shape", () => {
  it("writes settings.finish and leaves every placement identical by reference", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, PAL_ANTRACIT),
      placementWearing(1, undefined),
    ]);

    const result = setGlobalFinish({
      design,
      finish: PAL_GRI,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.finish).toEqual(PAL_GRI);
    expect(result.design.placements).toEqual(design.placements);
    expect(result.design.placements[0]).toBe(design.placements[0]);
    expect(result.design.placements[1]).toBe(design.placements[1]);
  });

  it("keeps the other whole-kitchen settings the design already carried", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, undefined),
    ]);

    const result = setGlobalFinish({
      design,
      finish: PAL_GRI,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.settings?.materialTierId).toBe("material.melamine");
    expect(result.design.settings?.cabinetDepthMm).toBe(
      design.settings?.cabinetDepthMm,
    );
  });

  it("refuses a colour the design's material does not offer, writing nothing", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, undefined),
    ]);

    const result = setGlobalFinish({
      design,
      finish: VENEER_STEJAR,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("FINISH_NOT_OFFERED");
    expect(result.design).toBe(design);
  });

  it("lets an undeclared material's kitchen take any colour, so a stale tier stays recolourable", () => {
    const design = designOn("material.gone", [placementWearing(0, undefined)]);

    const result = setGlobalFinish({
      design,
      finish: VENEER_STEJAR,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
  });

  it("refuses a timestamp it would otherwise write into updatedAt", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, undefined),
    ]);

    const result = setGlobalFinish({
      design,
      finish: PAL_GRI,
      occurredAt: "yesterday",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("INVALID_OCCURRED_AT");
  });
});

/** The six PAL decors, read off the declaration rather than listed here, so a decor added to
 *  `materials.ts` widens this sweep instead of leaving it silently narrower than the palette. */
const PAL_FINISHES: readonly Finish[] = paletteEntriesOf(
  materialById("material.melamine"),
).map((entry) => paletteFinish(entry.entryId));

describe("ADR 0099 acceptance 1 and 2 — the property the owner's warning becomes", () => {
  it("leaves every carried finish byte-identical, over any design and any legal global colour", () => {
    fc.assert(
      fc.property(
        // A placement count from none to the whole seeded kitchen, so the empty design and the
        // full one are both swept rather than assumed uninteresting.
        fc.nat({ max: KITCHEN_L_DESIGN.placements.length }),
        fc.array(
          fc.option(fc.constantFrom(...PAL_FINISHES), { nil: undefined }),
          {
            maxLength: KITCHEN_L_DESIGN.placements.length,
          },
        ),
        fc.constantFrom(...PAL_FINISHES),
        (placementCount, worn, globalFinish) => {
          const placements = Array.from({ length: placementCount }, (_, at) =>
            placementWearing(at, worn[at]),
          );
          const design = designOn("material.melamine", placements);

          const result = setGlobalFinish({
            design,
            finish: globalFinish,
            occurredAt: OCCURRED_AT,
          });

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          // Byte-identical, both ways: a carried finish survives verbatim, and a placement that
          // carried none did not grow the key.
          expect(JSON.stringify(result.design.placements)).toBe(
            JSON.stringify(design.placements),
          );
          for (const [at, placement] of result.design.placements.entries()) {
            expect(resolvedFinishOf(placement, result.design)).toEqual(
              worn[at] ?? globalFinish,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("ADR 0099 acceptance 3 — clearing an override tracks two subsequent global changes", () => {
  it("falls back to the kitchen's colour, not to the book's default, twice running", () => {
    const overriding = designOn("material.melamine", [
      placementWearing(0, PAL_ANTRACIT),
    ]);
    expect(overriding.placements[0]?.body.finish).toEqual(PAL_ANTRACIT);

    // ADR 0099 decision 8's own command, not a hand-built document: the clear must **delete the
    // key**, and writing the current global value into it instead would satisfy exactly one
    // subsequent change — which is why this asserts two.
    const clear = clearFinish({
      design: overriding,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: firstPlacementOf(overriding).id },
      occurredAt: OCCURRED_AT,
    });
    expect(clear.ok).toBe(true);
    if (!clear.ok) return;
    const cleared = clear.design;
    expect(cleared.placements[0]?.body).not.toHaveProperty("finish");

    const first = setGlobalFinish({
      design: cleared,
      finish: PAL_GRI,
      occurredAt: OCCURRED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(
      resolvedFinishOf(firstPlacementOf(first.design), first.design),
    ).toEqual(PAL_GRI);

    const second = setGlobalFinish({
      design: first.design,
      finish: PAL_ANTRACIT,
      occurredAt: OCCURRED_AT,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(
      resolvedFinishOf(firstPlacementOf(second.design), second.design),
    ).toEqual(PAL_ANTRACIT);
    expect(second.design.placements[0]?.body.finish).toBeUndefined();
  });
});

describe("ADR 0099 decision 8 — the way back out of an override", () => {
  it("removes the key rather than writing undefined into it, so a save round-trips identically", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, PAL_ANTRACIT),
    ]);

    const result = clearFinish({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: firstPlacementOf(design).id },
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `{ finish: undefined }` and no `finish` at all are the same object to `toEqual` and different
    // documents to `JSON.stringify` — which is what a save writes.
    expect(JSON.parse(JSON.stringify(result.design.placements[0]))).toEqual(
      result.design.placements[0],
    );
    expect(JSON.stringify(result.design.placements[0])).not.toContain("finish");
  });

  it("succeeds on a cabinet that has chosen nothing, rather than refusing a no-op", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, undefined),
    ]);

    const result = clearFinish({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: firstPlacementOf(design).id },
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect).toEqual({
      type: "finish_cleared",
      placementId: firstPlacementOf(design).id,
    });
  });

  it("touches no other cabinet", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, PAL_ANTRACIT),
      placementWearing(1, PAL_GRI),
    ]);

    const result = clearFinish({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: firstPlacementOf(design).id },
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements[1]).toBe(design.placements[1]);
  });
});

describe("ADR 0099 decision 7 — the confirmation's comparison base moved", () => {
  it("counts a cabinet matching the kitchen's colour as having chosen nothing", () => {
    const design = withGlobalFinish(
      designOn("material.melamine", [placementWearing(0, PAL_GRI)]),
      PAL_GRI,
    );

    expect(countCabinetsWearingAChosenFinish(design)).toBe(0);
  });

  it("still counts a cabinet that differs from the kitchen's colour", () => {
    const design = withGlobalFinish(
      designOn("material.melamine", [
        placementWearing(0, PAL_ANTRACIT),
        placementWearing(1, PAL_GRI),
      ]),
      PAL_GRI,
    );

    expect(countCabinetsWearingAChosenFinish(design)).toBe(1);
  });

  it("keeps the material's declared default as the base where no global colour is set", () => {
    const design = designOn("material.melamine", [
      placementWearing(0, PAL_ALB),
      placementWearing(1, PAL_ANTRACIT),
    ]);

    expect(
      sameFinish(PAL_ALB, materialById("material.melamine").defaultFinish),
    ).toBe(true);
    expect(countCabinetsWearingAChosenFinish(design)).toBe(1);
  });
});

describe("ADR 0099 decision 6 — a material change re-resolves the global level too", () => {
  it("is the case for MDF's white, which PAL does not offer", () => {
    const design = withGlobalFinish(
      designOn("material.painted-mdf", []),
      MDF_WHITE,
    );

    expect(resolvedDefaultFinishOf(design)).toEqual(MDF_WHITE);
    expect(
      sameFinish(MDF_WHITE, materialById("material.melamine").defaultFinish),
    ).toBe(false);

    const changed = setMaterialTier({
      design,
      tierId: "material.melamine",
      availableTierIds: ["material.painted-mdf", "material.melamine"],
      occurredAt: "2026-09-10T10:00:00.000Z",
    });

    expect(
      changed.ok ? changed.design.settings?.finish : changed.reason,
    ).toEqual(materialById("material.melamine").defaultFinish);
  });
});
