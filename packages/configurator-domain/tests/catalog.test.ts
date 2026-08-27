import { describe, expect, it } from "vitest";

import {
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
import type { BodyDefinition } from "../src/void-engine.js";

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

    // The five rows whose widths are the standard modules and nothing more. Named rather than
    // counted: `wall-2door` moving into this list would silently undo ADR 0029 on a resize.
    expect(ladder).toEqual([
      "base-2door",
      "base-3drawer",
      "base-panbank",
      "wall-lift",
      "open-shelf",
    ]);
    expect(bounded).toContain("wall-2door");
    expect(bounded).toContain("wall-1door");
    expect(bounded).toContain("base-sink");
  });
});
