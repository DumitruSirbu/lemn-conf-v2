import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  buildableSizes,
  describeKindLabel,
  INSERTABLE_BODY_DEFINITIONS,
  isKnownKind,
  listInsertableBodies,
  toInsertableBody,
} from "../src/catalog.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_PLACEMENTS,
} from "../src/fixtures/kitchen-l-design.js";
import { MIN_WIDTH_M, type BodyDefinition } from "../src/void-engine.js";

/** §2's default floor in millimetres, for the range guard below. */
const MIN_WIDTH_MM = 1000 * MIN_WIDTH_M;

const SEEDED_BUILD_IDS = [
  ...new Set(KITCHEN_L_PLACEMENTS.map((placement) => placement.body.buildId)),
];

describe("the one catalogue, two populations (ADR 0011 Gap A)", () => {
  it("carries every §7 entry as insertable", () => {
    expect(listInsertableBodies(KITCHEN_L_BODY_CATALOG)).toHaveLength(
      INSERTABLE_BODY_DEFINITIONS.length,
    );
  });

  it("marks every seeded entry not insertable, without losing it from the lookup", () => {
    for (const buildId of SEEDED_BUILD_IDS) {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition, buildId).toBeDefined();
      expect(definition?.insertable, buildId).toBe(false);
    }
  });

  it("adds no id that collides with a seeded one", () => {
    for (const [buildId] of INSERTABLE_BODY_DEFINITIONS) {
      expect(SEEDED_BUILD_IDS, buildId).not.toContain(buildId);
    }
  });

  it("gives every insertable entry the fields §5.2 reads", () => {
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const body = toInsertableBody(buildId, definition);
      expect(body, buildId).toBeDefined();
      expect(body?.label.length, buildId).toBeGreaterThan(0);
      expect(body?.sizesMm.length, buildId).toBeGreaterThan(0);
      expect(body?.nominalHeightMm, buildId).toBeGreaterThan(0);
    }
  });
});

describe("toInsertableBody", () => {
  it("refuses a seeded entry rather than throwing", () => {
    const seeded = KITCHEN_L_BODY_CATALOG.get("base-sink-800");
    expect(seeded).toBeDefined();
    expect(seeded && toInsertableBody("base-sink-800", seeded)).toBeUndefined();
  });

  it("refuses an entry that claims insertable but carries no catalogue fields", () => {
    const half: BodyDefinition = {
      kind: "base_cabinet",
      band: "base",
      frameDepthMm: 580,
      canFinish: true,
      canHandle: true,
      canReplace: true,
      canDelete: true,
      fixedWidth: false,
      insertable: true,
    };
    expect(toInsertableBody("half-declared", half)).toBeUndefined();
  });
});

describe("kind labels", () => {
  it("names every kind the seeded and insertable populations use", () => {
    for (const [, definition] of KITCHEN_L_BODY_CATALOG) {
      expect(isKnownKind(definition.kind), definition.kind).toBe(true);
    }
  });

  // §11 row 24: a fallback set once produced six guaranteed-refused rows for the hob.
  it("reports an unknown kind as unknown", () => {
    expect(isKnownKind("teleporter")).toBe(false);
    expect(describeKindLabel("teleporter").length).toBeGreaterThan(0);
  });
});

// Backlog entry 1's rule half. The defect was that §7 had **no** hob-bearing entry at all, so a
// deleted hob could never be offered back; the outcome half — that one actually goes into the
// vacated opening and is built with a hob on it — is `hob-base.test.ts` in `@lemnaria/three-adapter`,
// where the real builders and the real probe are.
describe("ADR 0027's hob-bearing bases", () => {
  const HOB_ENTRIES = [
    ["base-hob-2drawer", "Corp plită și 2 sertare"],
    ["base-hob-oven", "Corp plită și cuptor"],
  ] as const;

  it.each(HOB_ENTRIES)(
    "%s is an insertable 600 mm base carrying its Romanian label",
    (buildId, label) => {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition, buildId).toBeDefined();
      if (!definition) return;
      const body = toInsertableBody(buildId, definition);
      expect(body, buildId).toBeDefined();
      expect(body?.label).toBe(label);
      expect(body?.band).toBe("base");
      expect(body?.kind).toBe("base_cabinet");
      expect(body?.nominalHeightMm).toBe(860);
      // Fixed at 600 in both directions: the chips §9 offers and the widths §5.2 will build.
      expect(body?.sizesMm).toEqual([600]);
      expect(body?.widthFlex).toEqual([600]);
      expect(definition.fixedWidth).toBe(true);
    },
  );

  it("gives the two entries different labels, so the picker can tell them apart", () => {
    const [twoDrawer, oven] = HOB_ENTRIES;
    expect(twoDrawer[1]).not.toBe(oven[1]);
  });
});

describe("every insertable entry's two depth fields agree", () => {
  // The defect class M5 wave 5A met twice. `insertableBody` stamps `frameDepthMm` from the shape's
  // `nominalDepthMm`, and an entry built by spreading a helper and then overriding only the nominal
  // leaves `frameDepthMm` behind at the helper's number. It happened to `hood` (QA finding Q1.1,
  // inherited from the map-governed `WALL_DEPTH_MM`) and to `fridge-free` (560 from
  // `fullHeightUnit` against a 680 nominal).
  //
  // It matters because `void-engine.ts` takes `frameDepthMm` as the fallback for a placement with
  // no measured `seatDepthMm` — optional in `DesignSchema`, so such a design validates — and a
  // frame depth that is not the body's own depth seats its back face off the wall plane (§11
  // row 19). Inert through the UI, since `insertBody` always records a seat, which is exactly what
  // let both instances survive.
  //
  // Swept across the whole catalogue rather than asserted per entry, so a third instance cannot be
  // introduced by the same spread-and-override shape.
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s seats on its own nominal depth",
    (_buildId, definition) => {
      expect(definition.frameDepthMm).toBe(definition.nominalDepthMm);
    },
  );

  it("sweeps the whole catalogue, so the gate cannot go vacuous", () => {
    expect(INSERTABLE_BODY_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
  });
});

describe("every insertable entry says whether its widths are a bound or the ladder", () => {
  // ADR 0031 rule 5 needs the distinction, and `sizesAreStandardLadder` is declared per row rather
  // than inferred — §6.3's rule. Declaring it is exactly the kind of thing a new row forgets, and a
  // forgotten one is silent: the row keeps every width in its set, so nothing is built wrong and a
  // resize is merely refused where it should have been allowed.
  //
  // So the two facts are cross-checked here. They are not the same fact — a future entry could
  // legitimately declare `[400, 600, 800]` as a bound of its own — but the day one does, this gate
  // is where that has to be said out loud instead of arriving as a diff nobody read.
  const STANDARD_WIDTHS_MM = [400, 600, 800];

  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s declares the ladder if and only if it carries the standard set",
    (_buildId, definition) => {
      const carriesStandardSet =
        JSON.stringify(definition.sizesMm) ===
        JSON.stringify(STANDARD_WIDTHS_MM);
      expect(definition.sizesAreStandardLadder === true).toBe(
        carriesStandardSet,
      );
    },
  );

  it("has entries on both sides, so neither branch is untested", () => {
    const ladder = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) => definition.sizesAreStandardLadder === true,
    ).map(([buildId]) => buildId);
    const bounded = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) => definition.sizesAreStandardLadder !== true,
    ).map(([buildId]) => buildId);

    // The four rows whose widths are the standard modules and nothing more. Named rather than
    // counted: a hinged cabinet moving into this list would silently undo ADR 0030 on a resize, by
    // making every width above 200 legal — including the (400, 450] band where §7's builder still
    // makes a single door and the swing arc is the thing nobody should own.
    expect(ladder).toEqual([
      "base-3drawer",
      "base-panbank",
      "wall-lift",
      "open-shelf",
    ]);

    // ADR 0033 shrank this list by merging the door-count pairs, and the merged rows stay **bounded**
    // — see the note on `HINGED_CABINET_WIDTHS_MM`. ADR 0029's half of that bound is gone, since the
    // label now follows the width; ADR 0030's half is not, and no floor can express a hole in the
    // middle of a range.
    expect(bounded).toContain("base-cabinet");
    expect(bounded).toContain("wall-cabinet");
    expect(bounded).toContain("base-sink");
  });
});

// ---------------------------------------------------------------------------------------------
// ADR 0033's amendment: a hinged cabinet's widths are two ranges, not five values.
// ---------------------------------------------------------------------------------------------

describe("the widths a body may actually be built to", () => {
  const bodyOf = (buildId: string) => {
    const found = listInsertableBodies(KITCHEN_L_BODY_CATALOG).find(
      (candidate) => candidate.buildId === buildId,
    );
    if (!found) throw new Error(`no insertable entry ${buildId}`);
    return found;
  };

  // The amendment's own table, transcribed. Each row is a width and the rule that decides it, so a
  // failure names the rule rather than an arithmetic slip. 401–599 is one band and not two, because
  // the flip at 450 sits inside it: below it a one-door too wide to use, above it a two-door too
  // narrow to offer.
  it.each([
    [200, true, "the one-door range opens at 200 (ADR 0026's floor)"],
    [250, true, "continuous inside the one-door range"],
    [400, true, "the one-door cap (ADR 0030)"],
    [401, false, "above the one-door cap"],
    [450, false, "the flip itself is still above the cap"],
    [451, false, "two doors, but below the offered floor"],
    [570, false, "below the two-door floor of 600 (ADR 0029)"],
    [599, false, "the last width below the floor"],
    [600, true, "the two-door floor"],
    [700, true, "two honest 350 mm leaves — the width the amendment restores"],
    [800, true, "the two-door maximum"],
    [801, false, "above the maximum"],
    [900, false, "above the maximum, and correctly refused"],
  ])("builds a hinged cabinet at %i: %s — %s", (widthMm, expected) => {
    expect(acceptsWidthMm(bodyOf("wall-cabinet"), widthMm)).toBe(expected);
    expect(acceptsWidthMm(bodyOf("base-cabinet"), widthMm)).toBe(expected);
  });

  // **Cabinetry is continuous within its door-count range; appliances are discrete.** The rule the
  // amendment settles, asserted on the row it is about: a hood is 600 or 900 because those are the
  // sizes hoods come in, so 700 is refused and that refusal is the defect being fixed.
  it("keeps every appliance row discrete", () => {
    // **`base-sink` is not on this list, and its absence is the decision.** ADR 0033's amendment
    // reads it as *cabinetry with a fixed aperture* rather than an appliance that comes in sizes:
    // the 560 mm bowl is fixed, the carcass around it is not, and an 800 mm sink base is ordinary.
    // Its own case is below.
    for (const [buildId, sizesMm] of [
      ["hood", [600, 900]],
      ["base-dishwasher", [450, 600]],
      ["base-bottle-cargo", [200, 300]],
      ["fridge-free", [700]],
    ] as const) {
      const body = bodyOf(buildId);
      for (const widthMm of sizesMm) {
        expect(
          acceptsWidthMm(body, widthMm),
          `${buildId}@${String(widthMm)}`,
        ).toBe(true);
      }
      // One millimetre off any of its sizes is not a size it comes in.
      for (const widthMm of sizesMm) {
        expect(
          acceptsWidthMm(body, widthMm + 1),
          `${buildId}@${String(widthMm)}+1`,
        ).toBe(false);
      }
    }
  });

  // ADR 0033's amendment: the sink base is continuous from its aperture to the two-door maximum.
  // 559 is refused by ADR 0017's floor and not by this range — the two guards stay ordered rather
  // than stacked, which `minimum-width.adversarial.test.ts` asserts by code.
  it("makes the sink base continuous from its aperture upward", () => {
    const sink = bodyOf("base-sink");
    expect(acceptsWidthMm(sink, 559)).toBe(false);
    expect(acceptsWidthMm(sink, 560)).toBe(true);
    expect(acceptsWidthMm(sink, 700)).toBe(true);
    expect(acceptsWidthMm(sink, 800)).toBe(true);
    expect(acceptsWidthMm(sink, 801)).toBe(false);
  });

  // A standard-ladder row is one range from its floor upward, derived rather than declared — which
  // is what keeps `sizesAreStandardLadder` meaningful beside ranges instead of duplicated by them.
  it("leaves a standard-ladder row bounded only by its floor", () => {
    const panbank = bodyOf("base-panbank");
    expect(acceptsWidthMm(panbank, 299)).toBe(false);
    expect(acceptsWidthMm(panbank, 300)).toBe(true);
    expect(acceptsWidthMm(panbank, 570)).toBe(true);
    expect(acceptsWidthMm(panbank, 5000)).toBe(true);
  });

  // **The invariant that keeps §9 honest**, and the reason chips and ranges may differ without
  // drifting: every width the panel renders as a chip must be a width the engine will accept. A chip
  // outside every range is ADR 0017's "offered then refused" failure one layer up.
  // **The shape of a declared range, guarded rather than repaired** (logic review R1.4). A declared
  // range short-circuits the derivation, so it is the one arm that can express nonsense: an empty
  // list refuses every width and an inverted `minMm > maxMm` refuses silently, and neither is a rule
  // — both are a defect in the catalogue. `resolveWidthRangesMm` raises a declared minimum to the
  // floor that governs the entry, which is a *rule* and belongs in the function; it deliberately does
  // not repair a malformed list, because a row nobody can read is not a row to guess at.
  it("declares only ranges that are a range at all, and none under its floor", () => {
    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const declared = definition.widthRangesMm;
      if (declared === undefined) continue;
      expect(
        declared.length,
        `${buildId} declares an empty range list`,
      ).toBeGreaterThan(0);
      for (const range of declared) {
        expect(
          range.minMm,
          `${buildId} range ${String(range.minMm)}–${String(range.maxMm)}`,
        ).toBeLessThanOrEqual(range.maxMm);
        // At or above the floor `buildableSizes` applies, so a range can never reach under ADR 0017's
        // or ADR 0026's floor — the invariant `resolveWidthRangesMm` also enforces, asserted on the
        // shipped rows so a row that starts relying on the clamp is visible here first.
        expect(
          range.minMm,
          `${buildId} range opens under its own floor`,
        ).toBeGreaterThanOrEqual(definition.minWidthMm ?? MIN_WIDTH_MM);
      }
    }
  });

  // The clamp itself, on a synthetic row, since no shipped entry needs it: a range that opens under
  // the entry's floor is raised to the floor rather than believed. Without this the resize path —
  // whose only width predicate is `acceptsWidthMm` — would accept a width the insert path refuses.
  it("raises a declared range to the floor that governs the entry", () => {
    const wall = bodyOf("wall-cabinet");
    const underfloor = {
      ...wall,
      minWidthMm: 300,
      definition: { ...wall.definition, minWidthMm: 300 },
    };

    expect(acceptsWidthMm(underfloor, 250)).toBe(false);
    expect(acceptsWidthMm(underfloor, 300)).toBe(true);
    expect(acceptsWidthMm(wall, 250)).toBe(true);
  });

  it("puts every chip inside one of its entry's own ranges", () => {
    const offenders: string[] = [];
    for (const body of listInsertableBodies(KITCHEN_L_BODY_CATALOG)) {
      for (const widthMm of buildableSizes(body.minWidthMm, body.sizesMm)) {
        if (!acceptsWidthMm(body, widthMm)) {
          offenders.push(`${body.buildId}@${String(widthMm)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
