// **Adversarial QA of the corner ruling of 2026-09-09, at the four seams it has to cross after the
// customer has chosen.**
//
// `the-corner-wears-a-colour.test.ts` establishes that a corner may be given a colour and that one it
// was not given is the kitchen's. Both claims are about a document a moment after the command wrote
// it. **A colour a customer chooses has to survive being stored and re-opened, a material change, and
// a depth change** — and each of those three is a place where `canFinish: false` used to be what
// removed a corner's colour. Flipping that flag did not add the carry-through; it removed the thing
// that was blocking it, which is a different claim and is not asserted anywhere.
//
// Each seam had a reason to drop it before the ruling and would be silent about dropping it now:
//
// - **the load** — `migrate-design.ts`'s `dropFinishFromBodiesThatCannotWearOne` strips
//   `body.finish` from every placement whose catalogue entry reads `canFinish: false`, on **every**
//   load at **every** version. It normalises rather than refusing, so a corner losing its colour
//   here looks exactly like a corner that never had one;
// - **a material change** — `setMaterialTier`'s reset rewrites a finish the incoming material does
//   not offer, and ADR 0078 decision 1 makes the three materials' offers disjoint, so *every* change
//   between two declared materials reaches it. A corner must be rewritten to the new material's
//   default like any cabinet, and must keep its key;
// - **a depth change** — ADR 0074 rebuilds every body in the document through `carriedAppearance`,
//   which copies `finishKey` **only where `body.definition.canFinish`**. That gate is the one the
//   ruling flipped, and the recorded defect it exists for is *"a sage door with black bars silently
//   reset to white with steel."*
//
// **Every claim about a document is key presence** (`"finish" in body`) and never a resolved value —
// ADR 0093, and ADR 0099 decision 2's distinction: a corner following the kitchen and a corner that
// chose the identical colour render alike, are different documents, and only the second stops
// tracking the next global change. Each assertion about a corner is paired with the same assertion
// about an ordinary base cabinet in the same document, so a seam that dropped *everybody's* colour
// fails as a seam rather than passing as a corner.
import { describe, expect, it } from "vitest";

import { setFinish } from "../src/commands/set-appearance.js";
import { setCabinetDepth } from "../src/commands/set-cabinet-depth.js";
import {
  setGlobalFinish,
  setMaterialTier,
} from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import {
  materialById,
  materialOffersFinish,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../src/materials.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateDesign,
} from "../src/migrate-design.js";
import { validateDesignForCatalog } from "../src/validate-design.js";
import { derivePlacementRecords } from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";

const OCCURRED_AT = "2026-09-09T18:00:00.000Z";

const PAL_ID = "material.melamine";
const VENEER_ID = "material.veneer";
const VENEER_DEFAULT = materialById(VENEER_ID).defaultFinish;

const ANTRACIT = paletteFinish("pal.antracit");
const NUC_WARMIA = paletteFinish("pal.nuc-warmia");
const GRI_HAVANNA = paletteFinish("pal.gri-havanna");

/** An ordinary base cabinet in the same design — the witness that a seam kept *the corner's* colour
 *  rather than keeping everybody's, and that a seam which dropped it dropped only the corner. */
const ORDINARY_ID = "p1";

/** The depth the seeded design is not at, so the rebuild has something to do. */
const OTHER_DEPTH_MM = 700;

interface Corner {
  readonly placementId: string;
  readonly buildId: string;
}

/** **Read out of the catalogue rather than listed**, so a corner leaving `structuralReason: "corner"`
 *  shrinks this sweep visibly instead of silently. The count is pinned beneath it. */
const CORNERS: readonly Corner[] = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
)
  .filter(
    (record) =>
      KITCHEN_L_BODY_CATALOG.get(record.buildId)?.structuralReason === "corner",
  )
  .map((record) => ({ placementId: record.id, buildId: record.buildId }));

/** The design every case starts from: the seeded kitchen on PAL, with no cabinet carrying a colour
 *  of its own and the whole kitchen on one. */
function theKitchenOn(finish: Finish): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: PAL_ID,
      finish,
    },
    placements: KITCHEN_L_DESIGN.placements.map(withNoFinishOfItsOwn),
  };
}

function withNoFinishOfItsOwn(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

/** Chosen through the command, never written by hand: the ruling is that a customer can do this, and
 *  a hand-written key would prove the seams over a document no command produces. */
function afterChoosing(
  design: Design,
  placementId: string,
  finish: Finish,
): Design {
  const result = setFinish({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: placementId },
    finish,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`setFinish refused "${placementId}"`);
  return result.design;
}

function bodyOf(design: Design, placementId: string) {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`No placement "${placementId}"`);
  return placement.body;
}

function drawnFinishOn(
  design: Design,
  placementId: string,
): Finish | undefined {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record for placement "${placementId}"`);
  return record.drawnFinish;
}

/** A stored row as a load actually meets it: JSON at the version this build writes, through the same
 *  `migrateDesign` the persistence adapter calls. */
function storedAndReopened(design: Design): Design {
  return migrateDesign(
    CURRENT_SCHEMA_VERSION,
    JSON.parse(JSON.stringify(design)) as unknown,
    KITCHEN_L_BODY_CATALOG,
  );
}

function deepened(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: OTHER_DEPTH_MM,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error("setCabinetDepth refused the seeded design");
  return result.design;
}

describe("the premise, so every sweep below is about the bodies it claims to be about", () => {
  it("sweeps the four seeded corners and nothing else", () => {
    expect(CORNERS.map((corner) => corner.buildId).sort()).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]);
  });

  /** **Non-vacuity for the whole file** (ADR 0093): the ordinary witness must be a cabinet that can
   *  wear a colour, or every "the witness kept its colour" line below would be trivially satisfied. */
  it("uses a witness that can wear a colour of its own", () => {
    const chosen = afterChoosing(
      theKitchenOn(ANTRACIT),
      ORDINARY_ID,
      NUC_WARMIA,
    );

    expect("finish" in bodyOf(chosen, ORDINARY_ID)).toBe(true);
  });

  /** The two palette colours the file spends have to be **different** and both offered by PAL, or a
   *  corner that reverted to the kitchen's colour would be indistinguishable from one that kept its
   *  own. */
  it("spends two different colours the seeded material offers", () => {
    const pal = materialById(PAL_ID);

    expect(sameFinish(ANTRACIT, NUC_WARMIA)).toBe(false);
    expect(materialOffersFinish(pal, ANTRACIT)).toBe(true);
    expect(materialOffersFinish(pal, NUC_WARMIA)).toBe(true);
  });
});

describe("a corner's own colour survives being stored and re-opened", () => {
  it.each(CORNERS)(
    "$buildId comes back off the load still wearing what the customer chose",
    (corner) => {
      const chosen = afterChoosing(
        theKitchenOn(ANTRACIT),
        corner.placementId,
        NUC_WARMIA,
      );

      const reopened = storedAndReopened(chosen);

      expect(
        "finish" in bodyOf(reopened, corner.placementId),
        corner.buildId,
      ).toBe(true);
      expect(
        bodyOf(reopened, corner.placementId).finish,
        corner.buildId,
      ).toEqual(NUC_WARMIA);
      expect(drawnFinishOn(reopened, corner.placementId)).toEqual(NUC_WARMIA);
    },
  );

  /** **And the load did not invent one.** A corner following the kitchen must come back off the load
   *  with no key at all — the normalisation is allowed to remove a choice nobody could make, never to
   *  fill one in. */
  it.each(CORNERS)(
    "$buildId comes back off the load with no key when it was following",
    (corner) => {
      const reopened = storedAndReopened(theKitchenOn(ANTRACIT));

      expect(
        "finish" in bodyOf(reopened, corner.placementId),
        corner.buildId,
      ).toBe(false);
      expect(drawnFinishOn(reopened, corner.placementId)).toEqual(ANTRACIT);
    },
  );

  /** A document with a colour on a corner is one the write path accepts as well as one the load
   *  keeps — otherwise the choice is made, drawn, and refused on save. */
  it.each(CORNERS)("$buildId leaves the document valid", (corner) => {
    const chosen = afterChoosing(
      theKitchenOn(ANTRACIT),
      corner.placementId,
      NUC_WARMIA,
    );

    expect(
      validateDesignForCatalog(chosen, KITCHEN_L_BODY_CATALOG),
      corner.buildId,
    ).toEqual([]);
    expect(
      validateDesignForCatalog(
        storedAndReopened(chosen),
        KITCHEN_L_BODY_CATALOG,
      ),
      corner.buildId,
    ).toEqual([]);
  });
});

describe("a material change treats a corner's colour like any cabinet's", () => {
  /** ADR 0057's reset, on a corner: veneer offers none of PAL's palette, so the chosen colour is
   *  rewritten to veneer's declared default — **and the key stays**, because the corner still chose
   *  something, it is simply now the only thing veneer can give it. */
  it.each(CORNERS)(
    "$buildId is rewritten to the incoming material's default and keeps its key",
    (corner) => {
      const chosen = afterChoosing(
        theKitchenOn(ANTRACIT),
        corner.placementId,
        NUC_WARMIA,
      );

      const result = setMaterialTier({
        design: chosen,
        tierId: VENEER_ID,
        availableTierIds: [PAL_ID, VENEER_ID],
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok, corner.buildId).toBe(true);
      if (!result.ok) return;

      expect(
        "finish" in bodyOf(result.design, corner.placementId),
        corner.buildId,
      ).toBe(true);
      expect(
        bodyOf(result.design, corner.placementId).finish,
        corner.buildId,
      ).toEqual(VENEER_DEFAULT);
    },
  );

  /** **Absence stays absence** (ADR 0078 decision 5): a corner that was following must not come out
   *  of a material change carrying a key it never had. */
  it.each(CORNERS)(
    "$buildId gains no key from a material change while it is following",
    (corner) => {
      const result = setMaterialTier({
        design: theKitchenOn(ANTRACIT),
        tierId: VENEER_ID,
        availableTierIds: [PAL_ID, VENEER_ID],
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok, corner.buildId).toBe(true);
      if (!result.ok) return;

      expect(
        "finish" in bodyOf(result.design, corner.placementId),
        corner.buildId,
      ).toBe(false);
      expect(drawnFinishOn(result.design, corner.placementId)).toEqual(
        VENEER_DEFAULT,
      );
    },
  );
});

describe("a depth change rebuilds a corner without taking its colour", () => {
  /** ADR 0074 rebuilds **every** body, through the `canFinish` gate the ruling flipped. The recorded
   *  defect this gate exists for is a chosen appearance silently reset by a command aimed at
   *  something else. */
  it.each(CORNERS)(
    "$buildId keeps the colour the customer chose across a depth change",
    (corner) => {
      const chosen = afterChoosing(
        theKitchenOn(ANTRACIT),
        corner.placementId,
        NUC_WARMIA,
      );

      const rebuilt = deepened(chosen);

      expect(
        "finish" in bodyOf(rebuilt, corner.placementId),
        corner.buildId,
      ).toBe(true);
      expect(
        bodyOf(rebuilt, corner.placementId).finish,
        corner.buildId,
      ).toEqual(NUC_WARMIA);
      // The witness: the ordinary cabinet beside it is still on the kitchen's colour, so the rebuild
      // did not simply leave every body untouched.
      expect(drawnFinishOn(rebuilt, ORDINARY_ID)).toEqual(ANTRACIT);
    },
  );

  it.each(CORNERS)(
    "$buildId gains no key from a depth change while it is following",
    (corner) => {
      const rebuilt = deepened(theKitchenOn(ANTRACIT));

      expect(
        "finish" in bodyOf(rebuilt, corner.placementId),
        corner.buildId,
      ).toBe(false);
      expect(drawnFinishOn(rebuilt, corner.placementId)).toEqual(ANTRACIT);
    },
  );

  /** **The rebuild ran.** Non-vacuity for both cases above: a `setCabinetDepth` that refused, or one
   *  that returned the design it was given, would satisfy "kept its colour" without rebuilding
   *  anything. */
  it("moved the document to the depth it was asked for", () => {
    const rebuilt = deepened(theKitchenOn(ANTRACIT));

    expect(KITCHEN_L_DESIGN.settings?.cabinetDepthMm).not.toBe(OTHER_DEPTH_MM);
    expect(rebuilt.settings?.cabinetDepthMm).toBe(OTHER_DEPTH_MM);
  });
});

describe("the three seams composed, in the order a customer meets them", () => {
  /** Choose a colour on every corner, change the kitchen's colour, change the depth, store and
   *  re-open. Each seam is asserted on its own above; this is the one that catches a pair of them
   *  that only cancel out in isolation. */
  it("keeps four chosen corner colours through a global change, a depth change and a load", () => {
    let design = theKitchenOn(ANTRACIT);
    for (const corner of CORNERS) {
      design = afterChoosing(design, corner.placementId, NUC_WARMIA);
    }

    const moved = setGlobalFinish({
      design,
      finish: GRI_HAVANNA,
      occurredAt: OCCURRED_AT,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const reopened = storedAndReopened(deepened(moved.design));

    for (const corner of CORNERS) {
      expect(
        bodyOf(reopened, corner.placementId).finish,
        corner.buildId,
      ).toEqual(NUC_WARMIA);
      expect(
        drawnFinishOn(reopened, corner.placementId),
        corner.buildId,
      ).toEqual(NUC_WARMIA);
    }
    // The witness for the whole chain: the ordinary cabinet followed the kitchen through all three.
    expect("finish" in bodyOf(reopened, ORDINARY_ID)).toBe(false);
    expect(drawnFinishOn(reopened, ORDINARY_ID)).toEqual(GRI_HAVANNA);
  });
});
