import { describe, expect, it } from "vitest";

import {
  acceptsWidthMm,
  baseFinishedDepthMm,
  buildableSizes,
  describeBodyLabelAt,
  describeKindLabel,
  INSERTABLE_BODY_DEFINITIONS,
  isKnownKind,
  listInsertableBodies,
  resolveCatalogEquivalent,
  toInsertableBody,
} from "../src/catalog.js";
import { WORKTOP_DEPTH_MM } from "../src/worktop-depth.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_PLACEMENTS,
} from "../src/fixtures/kitchen-l-design.js";
import { finishesAtMm } from "../src/occupied-depth.js";
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

describe("every declared catalogue equivalent resolves to an insertable row", () => {
  // ADR 0022: a seeded body is priced, sized and named through the §7 row it points at. A pointer
  // naming no row, or naming a row that is not insertable, is a **catalogue** defect, and asserting
  // it here rather than guarding it in a reader covers `resolveCatalogEquivalent`'s three callers at
  // once — pricing, `resolveBuildableSizes`, and whichever reader is added next. A guard in the
  // pricing query would have covered pricing only, and would need re-inventing at every new reader.
  //
  // It is also what makes the worse latent case unreachable rather than merely unobserved: a book
  // that happens to price a seeded id would price a body with a dangling pointer under the wrong
  // rule and refuse nothing at all.

  it("resolves every pointer the catalogue declares, in both populations", () => {
    const declared = [...KITCHEN_L_BODY_CATALOG].flatMap(
      ([buildId, definition]) =>
        definition.catalogEquivalentId === undefined
          ? []
          : [[buildId, definition.catalogEquivalentId] as const],
    );

    // Not a vacuous sweep: wave 6A2 gave eighteen seeded rows a pointer.
    expect(declared.length).toBeGreaterThan(17);
    for (const [buildId, equivalentId] of declared) {
      const equivalent = KITCHEN_L_BODY_CATALOG.get(equivalentId);
      expect(equivalent, `${buildId} → ${equivalentId}`).toBeDefined();
      expect(equivalent?.insertable, `${buildId} → ${equivalentId}`).toBe(true);
      expect(
        resolveCatalogEquivalent(KITCHEN_L_BODY_CATALOG, buildId)?.buildId,
        buildId,
      ).toBe(equivalentId);
    }
  });

  it("leaves the structural corners pointing at nothing, and that is the right answer", () => {
    // The other half: a sweep that only checked declared pointers would pass on a catalogue that
    // declared none. ADR 0021 makes these four structural and §13.1 says a customer never chooses
    // one, so having no equivalent is correct for them and is what a book prices under their own id.
    const withoutPointer = [...KITCHEN_L_BODY_CATALOG]
      .filter(
        ([, definition]) =>
          definition.insertable !== true &&
          definition.catalogEquivalentId === undefined,
      )
      .map(([buildId]) => buildId);

    expect(withoutPointer.sort()).toEqual([
      "base-corner-return-320",
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]);
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
      occupiedDepth: finishesAtMm(baseFinishedDepthMm(WORKTOP_DEPTH_MM)),
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
  // The one named exception, and it is a decision rather than a leak. ADR 0039 decision 2 hangs the
  // hood at the **front** — its front face on the 600 mm cabinet-depth line, so a standard 500 mm
  // hood leaves 100 mm of gap behind it — and `frameDepthMm` is twice the *rear overhang* (ADR
  // 0018), not a depth. Seating the hood on its own nominal is precisely what decision 2 replaced,
  // so this entry seats on `2 × cabinetDepth − 500` instead. §11 row 19's second named exception,
  // after ADR 0025's corner leg: declared and measured, never a tolerance that drifted.
  //
  // Named here rather than filtered out, so the sweep still covers it and a *second* entry cannot
  // acquire the disagreement by accident.
  const FRONT_HUNG_SEAT_MM: Readonly<Record<string, number>> = {
    hood: 2 * 600 - 500,
  };

  /**
   * **This gate asserted `frameDepthMm === nominalDepthMm` until 2026-09-05, and that premise is
   * superseded by [ADR 0075](../../../docs/decisions/0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md)
   * decision 1.** It was true of every row only because the fronted wall rows were **wrong**: they
   * stated the finished 330 where ADR 0018 fixes this field as twice the rear overhang, and
   * `wallCabinet` builds `D − 39` centred on `z = 0`. Held to equality, `rebuildDepthM`'s worked
   * convergence becomes `330 → 369 → 408` and `occupiedDepthM` publishes a 369 mm wall cabinet
   * nobody manufactures.
   *
   * **The claim it makes now is stronger, not weaker**: the frame depth is the nominal *less what
   * the builder puts in front of it*, which the row already declares as
   * `occupiedDepth.frontAssemblyMm`. That is one number for every `recorded-shell` row —
   * `wall-cabinet` and `wall-lift` at 39, `open-shelf` at 0 — and equality for every row whose
   * builder seats the whole declared depth. Equality was the special case all along.
   *
   * `hood` stays a named exception because ADR 0039 hangs it at the **front**, so neither reading
   * applies; it is named rather than filtered so the sweep still covers it and a second entry cannot
   * acquire the disagreement by accident.
   */
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s seats on the depth its builder actually leaves behind it",
    (buildId, definition) => {
      // Required of every insertable row, so its absence is a defect rather than a case to handle.
      const nominalMm = definition.nominalDepthMm;
      expect(nominalMm, buildId).toBeDefined();
      if (nominalMm === undefined) return;

      const declared =
        definition.occupiedDepth.measuredFrom === "recorded-shell"
          ? nominalMm - definition.occupiedDepth.frontAssemblyMm
          : nominalMm;

      expect(definition.frameDepthMm).toBe(
        FRONT_HUNG_SEAT_MM[buildId] ?? declared,
      );
    },
  );

  // The rewrite above would be vacuous if every row were `wall-plane`. Both arms must be reached,
  // and the `recorded-shell` arm must contain rows on both sides of a zero front assembly.
  it("reaches both arms, and a fronted row and an unfronted one", () => {
    const shells = INSERTABLE_BODY_DEFINITIONS.filter(
      ([, definition]) =>
        definition.occupiedDepth.measuredFrom === "recorded-shell",
    );
    const fronted = shells.filter(
      ([, definition]) =>
        definition.occupiedDepth.measuredFrom === "recorded-shell" &&
        definition.occupiedDepth.frontAssemblyMm > 0,
    );

    expect(shells.length).toBeGreaterThan(fronted.length);
    expect(fronted.length).toBeGreaterThan(0);
    expect(INSERTABLE_BODY_DEFINITIONS.length).toBeGreaterThan(shells.length);
  });

  it("keeps the hood's exception real, and its nominal out of it", () => {
    const hood = INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === "hood")?.[1];

    expect(hood?.nominalDepthMm).toBe(500);
    expect(hood?.frameDepthMm).toBe(FRONT_HUNG_SEAT_MM["hood"]);
  });

  it("sweeps the whole catalogue, so the gate cannot go vacuous", () => {
    expect(INSERTABLE_BODY_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
  });
});

describe("every insertable entry declares the bound its widths come from", () => {
  // ADR 0035 decision 2 replaced `sizesAreStandardLadder` with a bound, and this is the guard that
  // boolean's guard became. The failure it catches has not changed shape: a row built by spreading
  // `baseCabinet` or `wallCabinet` and then overriding only `sizesMm` keeps the **cabinetry** bound
  // it inherited from the spread, so a dishwasher niche would accept every width from 300 to 800.
  // `cabinetryWidths` and `discreteWidths` each write both fields, which is why that cannot happen
  // by accident — this is the second line, not the only one.
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s declares ranges its own chips sit inside",
    (buildId, definition) => {
      const ranges = definition.widthRangesMm;
      expect(ranges, `${buildId} declares no width ranges`).toBeDefined();
      for (const widthMm of definition.sizesMm ?? []) {
        expect(
          ranges?.some(
            (range) => widthMm >= range.minMm && widthMm <= range.maxMm,
          ),
          `${buildId} offers ${String(widthMm)} outside every range it declares`,
        ).toBe(true);
      }
    },
  );

  // **The same guard's third field, and it is the one that was missing.** The two assertions above
  // read `widthRangesMm` and `sizesMm`; nothing read `widthFlex`, which is the field that decides
  // **which resolver an insert takes** — `'fit'` goes to `resolveFitWidth` and builds the opening,
  // a millimetre set goes to `resolveFixedSetWidth` and takes the widest listed size that fits.
  //
  // A row can therefore declare a perfectly good bound, publish chips inside it, satisfy both
  // assertions above, and still build 600 into every opening from 600 up. That is the hood's
  // finding R1.2 verbatim (`insert-fit.ts`, `resolveFixedSetWidth`), and ADR 0048's `tall-pantry`
  // is the second row exposed to it: its `widthFlex: "fit"` sits **after** the `fullHeightUnit`
  // spread that stamps `COLUMN_WIDTHS_MM`, so moving that one line above the spread would silently
  // restore the fixed set — an **ordering** mistake, invisible to a guard that reads only the two
  // fields the row got right. QA on wave 5B8 found this blind spot; the pin is here rather than in
  // that wave's own file because the rule is the catalogue's, not the pantry's.
  it.each(INSERTABLE_BODY_DEFINITIONS)(
    "%s declares the flexibility its own ranges imply",
    (buildId, definition) => {
      const isStepped = (definition.widthRangesMm ?? []).some(
        (range) => range.minMm < range.maxMm,
      );

      if (isStepped) {
        expect(
          definition.widthFlex,
          `${buildId} declares a bound but not 'fit', so an insert would narrow into it`,
        ).toBe("fit");
        return;
      }
      // A discrete row's declared set and its offered sizes are the same list, so a row that
      // overrode one without the other — the shape `discreteWidths` exists to prevent — fails here
      // rather than at the resolver.
      expect(
        definition.widthFlex,
        `${buildId} is discrete, so its flexibility is its own set`,
      ).toEqual(definition.sizesMm);
    },
  );

  // Both shapes ADR 0035 recognises, named rather than counted. A cabinetry row moving into the
  // discrete list would lose its stepper; an appliance row moving into the cabinetry list would let
  // a customer step a dishwasher niche to 550, which is decision 3 by name.
  it("has entries of both shapes, so neither is untested", () => {
    const stepped = INSERTABLE_BODY_DEFINITIONS.filter(([, definition]) =>
      (definition.widthRangesMm ?? []).some(
        (range) => range.minMm < range.maxMm,
      ),
    ).map(([buildId]) => buildId);

    expect(stepped).toEqual([
      "base-cabinet",
      "base-3drawer",
      "base-panbank",
      "base-sink",
      "wall-cabinet",
      "wall-lift",
      "open-shelf",
      "hood",
      // ADR 0048: the one full-height row with a stepper. It is last because it is last in §7's
      // order, and it is here at all because no appliance inside it fixes its width.
      "tall-pantry",
    ]);

    const discrete = INSERTABLE_BODY_DEFINITIONS.filter(([, definition]) =>
      (definition.widthRangesMm ?? []).every(
        (range) => range.minMm === range.maxMm,
      ),
    ).map(([buildId]) => buildId);

    // ADR 0035 decision 3's exclusion: the appliance is the fixed thing and the cabinet is built
    // around it. `base-bottle-cargo` is on this list for ADR 0026's reason instead — its members are
    // not established (backlog entry 2), and stepping it would invent 250 as a manufactured width.
    expect(discrete).toEqual([
      "base-hob-2drawer",
      "base-hob-oven",
      "base-bottle-cargo",
      "base-dishwasher",
      "tall-oven-tower",
      "tall-fridge-housing",
      "fridge-free",
    ]);
  });

  // ADR 0035 decision 1: 200–800, at 50 mm, **unbroken**. Pinned on the two hinged rows because they
  // are the ones whose chips were a curated list of five in ADR 0033 — the list six ADRs kept
  // correcting — and because 450 is the width the owner named on 2026-08-28 when they retired
  // ADR 0030's 400 mm one-door cap. A hole reappearing between 400 and 500 fails here first.
  it("steps a hinged cabinet's chips from 200 to 800 with no hole", () => {
    for (const buildId of ["base-cabinet", "wall-cabinet"]) {
      const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
      expect(definition?.sizesMm, buildId).toEqual([
        200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
      ]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// ADR 0033's amendment, as ADR 0035 leaves it: a hinged cabinet's widths are one continuous bound.
// ---------------------------------------------------------------------------------------------

// ADR 0029's defect class was "the label and the builder disagreed about the door count". They now
// read one function, so they agree by construction — but the flip is the one width where an edit
// could reintroduce it, and the geometry is pinned there while the *label* was not (logic review N7).
describe("the name a customer reads flips with the door count", () => {
  const hingedRow = (buildId: string) => {
    const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
    if (!definition) throw new Error(`no entry ${buildId}`);
    return definition;
  };

  it.each([
    [499, "1 ușă", "the last one-door width"],
    [500, "2 uși", "the flip (ADR 0035 decision 4)"],
  ])("names a wall cabinet at %i as %s — %s", (widthMm, expected) => {
    expect(describeBodyLabelAt(hingedRow("wall-cabinet"), widthMm)).toBe(
      `Corp suspendat ${expected}`,
    );
    expect(describeBodyLabelAt(hingedRow("base-cabinet"), widthMm)).toBe(
      `Corp bază ${expected}`,
    );
  });
});

describe("the widths a body may actually be built to", () => {
  const bodyOf = (buildId: string) => {
    const found = listInsertableBodies(KITCHEN_L_BODY_CATALOG).find(
      (candidate) => candidate.buildId === buildId,
    );
    if (!found) throw new Error(`no insertable entry ${buildId}`);
    return found;
  };

  // The amendment's own table, transcribed and then flattened by the owner's 2026-08-28 ruling. Each
  // row is a width and the rule that decides it, so a failure names the rule rather than an
  // arithmetic slip.
  //
  // **There is no refused band in the middle any more.** The table carried one at 401–599 under
  // ADR 0033, and at 401–499 under a first pass at this wave; both were ADR 0030's 400 mm one-door
  // cap. The owner retired that cap in the same breath as moving the threshold — "let's add this 450
  // for one door… two doors start from 500" — so the width now decides the door **count** and never
  // whether the cabinet exists at all. Only the two ends refuse.
  it.each([
    [199, false, "under ADR 0026's declared floor"],
    [200, true, "the bound opens at 200 (ADR 0026's floor)"],
    [250, true, "continuous, and a one-door"],
    [400, true, "ADR 0030's retired cap — an ordinary width now"],
    [401, true, "one millimetre past the retired cap"],
    [
      450,
      true,
      "the width the owner named: a one-door, and §11 row 14's dishwasher match",
    ],
    [470, true, "reachable by relative stepping (570 → 520 → 470), a one-door"],
    [499, true, "the last one-door width"],
    [500, true, "the flip (ADR 0035 decision 4): two doors from here up"],
    [550, true, "reached by the stepper, and no longer a curated exclusion"],
    [570, true, "the shipped corner return's width, buildable as a two-door"],
    [600, true, "ADR 0029's old floor, now an ordinary width inside the bound"],
    [700, true, "two honest 350 mm leaves"],
    [800, true, "§7's ceiling"],
    [801, false, "above the ceiling"],
    [900, false, "above the ceiling, and correctly refused"],
  ])("builds a hinged cabinet at %i: %s — %s", (widthMm, expected) => {
    expect(acceptsWidthMm(bodyOf("wall-cabinet"), widthMm)).toBe(expected);
    expect(acceptsWidthMm(bodyOf("base-cabinet"), widthMm)).toBe(expected);
  });

  // **Cabinetry is continuous between its bounds; appliances are discrete** (ADR 0035 decision 3).
  // Asserted on the rows it is about: a dishwasher niche is 450 or 600 because dishwashers are, and
  // one millimetre off either is not a size it comes in.
  it("keeps every appliance row discrete", () => {
    // **Neither `base-sink` nor `hood` is on this list, and both absences are decisions.** ADR 0033's
    // amendment reads the sink base as *cabinetry with a fixed aperture* — the 560 mm bowl is fixed,
    // the carcass around it is not — and ADR 0035 decision 5 gives the hood the same 600–800 bounds
    // every other cabinetry entry carries. Their own cases are below.
    for (const [buildId, sizesMm] of [
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

  // ADR 0033's amendment: the sink base is continuous from its aperture to §7's ceiling. 559 is
  // refused by ADR 0017's floor and not by this range — the two guards stay ordered rather than
  // stacked, which `minimum-width.adversarial.test.ts` asserts by code.
  it("makes the sink base continuous from its aperture upward", () => {
    const sink = bodyOf("base-sink");
    expect(acceptsWidthMm(sink, 559)).toBe(false);
    expect(acceptsWidthMm(sink, 560)).toBe(true);
    expect(acceptsWidthMm(sink, 700)).toBe(true);
    expect(acceptsWidthMm(sink, 800)).toBe(true);
    expect(acceptsWidthMm(sink, 801)).toBe(false);
  });

  // ADR 0035 decision 5, on the row the owner ruled on by name: the hood starts at 600 — its `−50`
  // is greyed out there — and stops at §7's ceiling like every other cabinetry entry. 700 is now a
  // hood, and 900 is not: the discrete `{600, 900}` set went with the ladder.
  it("bounds the hood at 600–800", () => {
    const hood = bodyOf("hood");
    expect(acceptsWidthMm(hood, 599)).toBe(false);
    expect(acceptsWidthMm(hood, 600)).toBe(true);
    expect(acceptsWidthMm(hood, 700)).toBe(true);
    expect(acceptsWidthMm(hood, 800)).toBe(true);
    expect(acceptsWidthMm(hood, 900)).toBe(false);
  });

  // ADR 0035 decision 2: a plain cabinetry row is one range, floor to ceiling. It replaces the
  // standard ladder's `[floor, ∞)`, and the ceiling is the visible difference — a ladder was silent
  // about everything above 800 rather than permitting it, which is the fact ADR 0035 settles.
  it("bounds a plain cabinetry row from §2's floor to §7's ceiling", () => {
    const panbank = bodyOf("base-panbank");
    expect(acceptsWidthMm(panbank, 299)).toBe(false);
    expect(acceptsWidthMm(panbank, 300)).toBe(true);
    expect(acceptsWidthMm(panbank, 570)).toBe(true);
    expect(acceptsWidthMm(panbank, 800)).toBe(true);
    expect(acceptsWidthMm(panbank, 801)).toBe(false);
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
