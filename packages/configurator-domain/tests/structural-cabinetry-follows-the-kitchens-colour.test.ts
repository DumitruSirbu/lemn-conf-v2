// **The owner's ruling of 2026-09-09, one named body at a time** — backlog entry 60: *structural
// cabinetry follows the kitchen's colour; appliances never do*, with *"open shelves can have and by
// default should inherit global set color"* and *"fridge no, hood also no"*.
//
// **Why every claim is per body and never per flag.** Until this ruling, `canFinish: false` named
// one class and ADR 0099 decision 8 ruled the whole class unaffected at both levels. It now names
// two: bodies that follow the kitchen and bodies painted at no level, and each still carries the
// flag, because neither gains a control of its own. A test written as
// `records.filter((record) => !record.canFinish)` would still be green today and would be asserting
// the wrong rule for one of the three, so the flag is never swept here.
//
// **The corner ruling of 2026-09-09 (later the same day) took four bodies out of this file.** The
// owner: *"the corner cabinets — that column specifically — miss custom color setting."* The four
// corner bodies now declare a control and `CHOOSES_ITS_OWN_COLOUR`, so what is asserted about them
// is the opposite of every claim below and lives in `the-corner-wears-a-colour.test.ts`. This file
// keeps the three bodies that still have no control: the open shelf, the hood and the fridge.
//
// **And never a list of build ids either** (ADR 0058 decision 2, ADR 0103 decision 4). The table
// below names the bodies so a failure says which one, but what it asserts each row *against* is the
// entry's own `finishRule`, resolved through the same fail-closed function the catalogue is
// assembled with. A body moved between the two families in `kitchen-l-design.ts` fails the premise
// by name rather than leaving this file asserting the rule it was moved off.
//
// **Every document claim is key presence** (`"finish" in body`), never a resolved value — ADR 0093,
// and ADR 0099 decision 2's whole point: a body following the kitchen and a body that chose the
// identical colour render alike and are different documents, and only the second stops tracking the
// next global change. The open shelf must never grow that key: it has no control that could have
// written it.
import { describe, expect, it } from "vitest";

import {
  bodyFinishRuleOf,
  ContradictoryBodyFinishRuleError,
  CHOOSES_ITS_OWN_COLOUR,
  FOLLOWS_THE_KITCHENS_COLOUR,
  IS_NEVER_PAINTED,
  UndeclaredBodyFinishRuleError,
  type BodyFinishRule,
} from "../src/body-finish-rule.js";
import { setFinish } from "../src/commands/set-appearance.js";
import { setGlobalFinish } from "../src/commands/set-whole-kitchen-settings.js";
import type { Design, DesignPlacement } from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  refuseUndeclaredFinishRules,
} from "../src/fixtures/kitchen-l-design.js";
import { materialById, paletteFinish, type Finish } from "../src/materials.js";
import {
  derivePlacementRecords,
  type BodyDefinition,
} from "../src/void-engine.js";

const OCCURRED_AT = "2026-09-09T12:00:00.000Z";

/** Veneer, not melamine: its declared default is a tinted oak, so *following the kitchen* and *left
 *  on the material's white* are different values. Melamine's default is `pal.alb`, the same hex the
 *  kit gives an unpainted door, which is the coincidence ADR 0099 Amendment A section 3 records as
 *  having made an acceptance criterion vacuous. */
const VENEER_ID = "material.veneer";
const VENEER_DEFAULT = materialById(VENEER_ID).defaultFinish;

const PAL_ID = "material.melamine";
const ANTRACIT = paletteFinish("pal.antracit");
const GRI_HAVANNA = paletteFinish("pal.gri-havanna");
const NUC_WARMIA = paletteFinish("pal.nuc-warmia");

/** An ordinary base cabinet: the witness that the scene resolved anything at all, and the body the
 *  third claim — *a chosen colour still wins* — is made about. */
const CHOOSING_ID = "p1";

interface NamedBody {
  readonly placementId: string;
  readonly buildId: string;
  readonly rule: BodyFinishRule;
}

/** **Every seeded body that carries no colour control, named, with the rule its entry must declare.**
 *
 * **Three rows since the owner's corner ruling of 2026-09-09, and it was seven.** The four corner
 * bodies were the other four: they now declare `CHOOSES_ITS_OWN_COLOUR` with a control of their own,
 * so they are not this file's subject any more and are asserted in
 * `the-corner-wears-a-colour.test.ts` instead. `STRUCTURAL_CORNER` declares all four together, so
 * they left together; the premise below re-derives this table's membership from the catalogue, and
 * a corner that came back would fail it by name.
 */
const UNCHOOSING: readonly NamedBody[] = [
  {
    placementId: "p12",
    buildId: "open-shelf-600",
    rule: FOLLOWS_THE_KITCHENS_COLOUR,
  },
  { placementId: "p13", buildId: "hood-600", rule: IS_NEVER_PAINTED },
  { placementId: "p7", buildId: "fridge-free-700", rule: IS_NEVER_PAINTED },
];

const FOLLOWING = UNCHOOSING.filter(
  (row) => row.rule === FOLLOWS_THE_KITCHENS_COLOUR,
);
const APPLIANCES = UNCHOOSING.filter((row) => row.rule === IS_NEVER_PAINTED);

function onMaterial(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
    placements: KITCHEN_L_DESIGN.placements.map(withNoFinishOfItsOwn),
  };
}

function withNoFinishOfItsOwn(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

function withKitchenColour(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** A colour written straight into a body's document — reachable by a restored backup or another
 *  client, never by this build's commands, because none of these bodies has a control. */
function wearing(design: Design, placementId: string, finish: Finish): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

/** The kitchen's colour set through the command, so what it writes onto a body is the product's doing. */
function afterTheKitchenIsColoured(finish: Finish): Design {
  const result = setGlobalFinish({
    design: onMaterial(PAL_ID),
    finish,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function recordFor(design: Design, placementId: string) {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record for placement "${placementId}"`);
  return record;
}

function bodyOf(design: Design, placementId: string) {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`No placement "${placementId}"`);
  return placement.body;
}

describe("backlog 60 — the premise: the table is the catalogue's own declaration", () => {
  /** Both directions, so a body joining or leaving the class fails here by name rather than silently
   *  changing what every other assertion in this file covers. */
  it("names every seeded body with no colour control, and nothing else", () => {
    const withoutAControl = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    ).filter((record) => !record.canFinish);

    expect(withoutAControl.map((record) => record.id).sort()).toEqual(
      UNCHOOSING.map((row) => row.placementId).sort(),
    );
  });

  it.each(UNCHOOSING)("$buildId declares $rule", (row) => {
    const definition = KITCHEN_L_BODY_CATALOG.get(row.buildId);
    expect(definition, row.buildId).toBeDefined();

    expect(ruleOf(definition, row.buildId), row.buildId).toBe(row.rule);
  });

  /** The split is real on both sides: one follows and two never paint. Stated so a change that
   *  collapsed the two families back into one fails here rather than making every `it.each` below
   *  run over an empty list and pass. */
  it("splits the three into one that follows and two that never paint", () => {
    expect(FOLLOWING.map((row) => row.buildId).sort()).toEqual([
      "open-shelf-600",
    ]);
    expect(APPLIANCES.map((row) => row.buildId).sort()).toEqual([
      "fridge-free-700",
      "hood-600",
    ]);
  });

  /** And an ordinary cabinet is on the third arm, so "follows" is a rule about these bodies rather
   *  than about every body. */
  it("puts an ordinary base cabinet on the arm that chooses its own colour", () => {
    const buildId = recordFor(KITCHEN_L_DESIGN, CHOOSING_ID).buildId;

    expect(ruleOf(KITCHEN_L_BODY_CATALOG.get(buildId), buildId)).toBe(
      CHOOSES_ITS_OWN_COLOUR,
    );
  });
});

describe("backlog 60 — structural cabinetry is drawn in the kitchen's colour", () => {
  it.each(FOLLOWING)("$buildId is drawn in the kitchen's colour", (row) => {
    const design = withKitchenColour(onMaterial(PAL_ID), ANTRACIT);

    expect(recordFor(design, row.placementId).drawnFinish, row.buildId).toEqual(
      ANTRACIT,
    );
    // The witness: an ordinary cabinet in the same design took the same colour, so this is the
    // kitchen's colour reaching the corner rather than every body resolving to something.
    expect(recordFor(design, CHOOSING_ID).drawnFinish).toEqual(ANTRACIT);
  });

  /** **And its document did not grow a key** (ADR 0099 decision 2). Key presence, not value: these
   *  bodies have no control, so a `finish` on one is a choice nobody could have made. */
  it.each(FOLLOWING)("$buildId keeps its finish key absent", (row) => {
    const design = afterTheKitchenIsColoured(ANTRACIT);

    expect("finish" in bodyOf(design, row.placementId), row.buildId).toBe(
      false,
    );
  });

  /** Two changes, not one: a single change is satisfiable by writing the current global value into
   *  the key, which is exactly the conversion decision 2 forbids. */
  it.each(FOLLOWING)(
    "$buildId tracks two successive kitchen colours",
    (row) => {
      const first = setGlobalFinish({
        design: onMaterial(PAL_ID),
        finish: ANTRACIT,
        occurredAt: OCCURRED_AT,
      });
      expect(first.ok, row.buildId).toBe(true);
      if (!first.ok) return;
      const second = setGlobalFinish({
        design: first.design,
        finish: GRI_HAVANNA,
        occurredAt: OCCURRED_AT,
      });
      expect(second.ok, row.buildId).toBe(true);
      if (!second.ok) return;

      expect(recordFor(second.design, row.placementId).drawnFinish).toEqual(
        GRI_HAVANNA,
      );
      expect("finish" in bodyOf(second.design, row.placementId)).toBe(false);
    },
  );

  /** With no kitchen colour it falls back to the material's declared default, like any other
   *  cabinet — on veneer, where that default is a tinted oak and not the kit's white. */
  it.each(FOLLOWING)(
    "$buildId falls back to the material's declared default",
    (row) => {
      const design = onMaterial(VENEER_ID);

      expect(
        recordFor(design, row.placementId).drawnFinish,
        row.buildId,
      ).toEqual(VENEER_DEFAULT);
    },
  );

  /** **It follows and it does not choose.** A colour in its own document — which only a restored
   *  backup or another client could have put there — is not what gets drawn. */
  it.each(FOLLOWING)(
    "$buildId draws the kitchen's colour and not a colour written onto its own body",
    (row) => {
      const design = wearing(
        withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
        row.placementId,
        NUC_WARMIA,
      );

      expect(
        recordFor(design, row.placementId).drawnFinish,
        row.buildId,
      ).toEqual(ANTRACIT);
    },
  );

  /** And it still offers no control: `setFinish` refuses it, which is the half of ADR 0099 decision
   *  8 the ruling leaves standing and the reason the key can never appear. */
  it.each(FOLLOWING)("$buildId is still refused a colour of its own", (row) => {
    const result = setFinish({
      design: withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: row.placementId },
      finish: NUC_WARMIA,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok, row.buildId).toBe(false);
  });
});

describe("backlog 60 — an appliance is drawn in no colour at all", () => {
  it.each(APPLIANCES)(
    "$buildId carries no drawn colour under a kitchen colour",
    (row) => {
      const design = withKitchenColour(onMaterial(PAL_ID), ANTRACIT);

      // Key absence, not `toBeUndefined`: the field is omitted rather than written empty, and a
      // value assertion would pass while the key was being stamped.
      expect(
        recordFor(design, row.placementId),
        row.buildId,
      ).not.toHaveProperty("drawnFinish");
      expect(recordFor(design, CHOOSING_ID).drawnFinish).toEqual(ANTRACIT);
    },
  );

  /** Not the material's default either — *"fridge no, hood also no"* is at every level, so a bare
   *  kitchen on veneer leaves it with nothing rather than with the declared oak. */
  it.each(APPLIANCES)(
    "$buildId carries no drawn colour on a kitchen with none set",
    (row) => {
      const design = onMaterial(VENEER_ID);

      expect(
        recordFor(design, row.placementId),
        row.buildId,
      ).not.toHaveProperty("drawnFinish");
      expect(recordFor(design, CHOOSING_ID).drawnFinish).toEqual(
        VENEER_DEFAULT,
      );
    },
  );

  it.each(APPLIANCES)(
    "$buildId carries no drawn colour even when its own body holds one",
    (row) => {
      const design = wearing(
        withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
        row.placementId,
        NUC_WARMIA,
      );

      expect(
        recordFor(design, row.placementId),
        row.buildId,
      ).not.toHaveProperty("drawnFinish");
    },
  );

  it.each(APPLIANCES)("$buildId keeps its finish key absent", (row) => {
    const design = afterTheKitchenIsColoured(ANTRACIT);

    expect("finish" in bodyOf(design, row.placementId), row.buildId).toBe(
      false,
    );
  });
});

describe("backlog 60 — a body that chooses still wins over the kitchen", () => {
  it("draws the cabinet's own colour where it chose one", () => {
    const chosen = setFinish({
      design: withKitchenColour(onMaterial(PAL_ID), ANTRACIT),
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id: CHOOSING_ID },
      finish: NUC_WARMIA,
      occurredAt: OCCURRED_AT,
    });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;

    expect(recordFor(chosen.design, CHOOSING_ID).drawnFinish).toEqual(
      NUC_WARMIA,
    );
    expect(recordFor(chosen.design, CHOOSING_ID).finishKey).toEqual(NUC_WARMIA);
    // ...and its structural neighbour went on following the kitchen, so the two levels stayed apart.
    expect(recordFor(chosen.design, "p25").drawnFinish).toEqual(ANTRACIT);
  });
});

describe("backlog 60 — the declaration fails closed", () => {
  const ORDINARY = "base-cabinet";

  it("refuses an entry that declares no finish rule", () => {
    expect(() => {
      bodyFinishRuleOf({ buildId: ORDINARY, rule: undefined, canFinish: true });
    }).toThrow(UndeclaredBodyFinishRuleError);
  });

  /** The two declarations bind: a body chooses its own colour if and only if it has a control. An
   *  entry where they disagree is refused rather than one of them winning silently. */
  it("refuses an entry whose finish rule contradicts its control", () => {
    expect(() => {
      bodyFinishRuleOf({
        buildId: ORDINARY,
        rule: FOLLOWS_THE_KITCHENS_COLOUR,
        canFinish: true,
      });
    }).toThrow(ContradictoryBodyFinishRuleError);
    expect(() => {
      bodyFinishRuleOf({
        buildId: ORDINARY,
        rule: CHOOSES_ITS_OWN_COLOUR,
        canFinish: false,
      });
    }).toThrow(ContradictoryBodyFinishRuleError);
  });

  /** The sweep the catalogue is assembled with, so an undeclared row never loads rather than being
   *  read as one family or the other at whatever seam asks first. */
  it("refuses a catalogue holding an entry that declares nothing", () => {
    const declared = KITCHEN_L_BODY_CATALOG.get("base-cabinet");
    expect(declared).toBeDefined();
    if (!declared) return;
    const undeclared: BodyDefinition = { ...declared };
    delete (undeclared as { finishRule?: BodyFinishRule }).finishRule;

    expect(() => {
      refuseUndeclaredFinishRules([["base-cabinet", undeclared]]);
    }).toThrow(UndeclaredBodyFinishRuleError);
  });

  it("assembles the shipped catalogue at both declared depths", () => {
    expect(() => buildKitchenLBodyCatalog(600)).not.toThrow();
    expect(() => buildKitchenLBodyCatalog(700)).not.toThrow();
  });
});

/** The entry's declaration, resolved through the same function the catalogue is assembled with, so
 *  this file reads the rule rather than restating it. */
function ruleOf(
  definition: BodyDefinition | undefined,
  buildId: string,
): BodyFinishRule {
  return bodyFinishRuleOf({
    buildId,
    rule: definition?.finishRule,
    canFinish: definition?.canFinish ?? true,
  });
}
