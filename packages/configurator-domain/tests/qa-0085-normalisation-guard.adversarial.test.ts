// **Adversarial QA for ADR 0085's guard.** Written to falsify, not to confirm.
//
// `correctPreCorrectionRoom`'s guard stopped asking *"is the corrected document fatally invalid?"*
// and started asking *"does the correction create a fatal finding the document did not carry?"*. The
// two failure modes that change costs the product something real, and neither is visible from a
// single example:
//
//   - **Too permissive.** The guard degrades towards "always correct", and a `/d/{id}` link that
//     loaded before the correction stops loading after it (ADR 0052).
//   - **Too strict.** The guard keeps declining for a reason the room has no bearing on, which is
//     the defect ADR 0085 exists to close, one code later.
//
// The shipped suite pins both with fixed witnesses at `depthMm: 3580` and `depthMm: 2500`. This file
// sweeps the transition those two literals sit either side of, states the ADR 0052 property as a
// property rather than as an example, and attacks acceptance criterion 4 — *the severity table
// cannot reach the guard* — with a family of room-invariant fatal findings rather than the one code
// that raised the record.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type { Design, DesignPlacement, EmptyColumn } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { paletteFinish } from "../src/materials.js";
import { migrateDesign } from "../src/migrate-design.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;

/** The room every document up to version 2 carries, and the only room the arm is reached from. */
const PRE_CORRECTION_ROOM = {
  shape: "L",
  widthMm: 3600,
  depthMm: 2400,
  heightMm: 2600,
} as const;

/** **Wall A's width and nothing else is pinned here.** ADR 0085's *Consequences* leave
 *  `CORRECTED_ROOM_MM`'s `depthMm` to wave 6N-0, which changes it from 2830 to 2920, and the record
 *  states the two waves rebase onto each other precisely because wall A is 3560 in both. Every
 *  assertion below reads the width, and reads the corrected depth off an actual load rather than
 *  restating it. */
const CORRECTED_WIDTH_MM = 3560;

/** The version the room arm is owed by. */
const PRE_CORRECTION_VERSION = 2;

function storedAt(overrides: Partial<Design>): unknown {
  return JSON.parse(
    JSON.stringify({
      ...KITCHEN_L_DESIGN,
      room: PRE_CORRECTION_ROOM,
      ...overrides,
    }),
  ) as unknown;
}

function asDesign(raw: unknown): Design {
  return raw as Design;
}

function load(raw: unknown): Design {
  return migrateDesign(PRE_CORRECTION_VERSION, raw, CATALOG);
}

function fatalKeysOf(design: Design): readonly string[] {
  return fatalDesignValidationIssues(
    validateDesignForCatalog(design, CATALOG),
  ).map((issue) => `${issue.path}:${issue.code}`);
}

function atRoom(design: Design, room: Partial<Design["room"]>): Design {
  return { ...design, room: { ...design.room, ...room } };
}

/** The room the correction actually produces, measured rather than restated, so 6N-0's change to
 *  `CORRECTED_ROOM_MM.depthMm` lands here as a new measurement and not as a failure. */
const CORRECTED_ROOM = load(storedAt({})).room;

/** What the correction *creates*, computed the way the guard is specified rather than the way it is
 *  implemented: the fatal findings of the corrected document that the stored one does not carry. */
function fatalFindingsTheCorrectionCreates(stored: Design): readonly string[] {
  const carried = new Set(fatalKeysOf(stored));
  return fatalKeysOf(atRoom(stored, CORRECTED_ROOM)).filter(
    (key) => !carried.has(key),
  );
}

/** A space on wall B in a band the seeded placements leave free, so `depthMm` — bounded by the
 *  room's `widthMm`, the one dimension the correction narrows — is the only thing it can be fatal
 *  for. */
function wallBSpaceOfDepth(depthMm: number): EmptyColumn {
  return {
    wall: "B",
    alongMm: 300,
    widthMm: 400,
    y0Mm: 0,
    topMm: 820,
    depthMm,
  };
}

/** The same, on wall A, whose `depthMm` bound the correction *widens* from 2400. */
function wallASpaceOfDepth(depthMm: number): EmptyColumn {
  return {
    wall: "A",
    alongMm: 3530,
    widthMm: 40,
    y0Mm: 0,
    topMm: 820,
    depthMm,
  };
}

// **Attack 1 — where exactly is the transition, and is there one at all?**
//
// The shipped witness is a single `depthMm: 3580`, which is true of a guard that declines at 3580
// and equally true of one that declines at every depth, or at every depth above 3000. A sweep across
// the correction's own narrowing is what says the guard tracks the corrected width and nothing else.
describe("the guard's decision tracks the corrected width, at the millimetre", () => {
  /** How a load of a document carrying one wall-B space of this depth came out. */
  function outcomeAtDepth(depthMm: number): string {
    try {
      const loaded = load(
        storedAt({ emptyColumns: [wallBSpaceOfDepth(depthMm)] }),
      );
      return loaded.room.widthMm === CORRECTED_WIDTH_MM
        ? "corrected"
        : "declined";
    } catch {
      return "refused";
    }
  }

  it("corrects up to the corrected width, declines above it, and refuses above the stored one", () => {
    const measured = new Map<string, number[]>();
    for (let depthMm = 3540; depthMm <= 3620; depthMm += 1) {
      const outcome = outcomeAtDepth(depthMm);
      measured.set(outcome, [...(measured.get(outcome) ?? []), depthMm]);
    }

    const bandOf = (outcome: string): readonly number[] =>
      measured.get(outcome) ?? [];
    expect({
      correctedFrom: bandOf("corrected")[0],
      correctedTo: bandOf("corrected").at(-1),
      declinedFrom: bandOf("declined")[0],
      declinedTo: bandOf("declined").at(-1),
      refusedFrom: bandOf("refused")[0],
      refusedTo: bandOf("refused").at(-1),
    }).toEqual({
      correctedFrom: 3540,
      correctedTo: 3560,
      declinedFrom: 3561,
      declinedTo: 3600,
      refusedFrom: 3601,
      refusedTo: 3620,
    });
  });

  // The other side of the same transition, and the half a "declines when the corrected document is
  // fatal" guard gets wrong: a space the *stored* room already refuses is a finding carried under
  // both rooms once the correction widens wall A past it, so it may not veto anything.
  it("corrects across the whole range of a wall A space the correction rescues", () => {
    for (let depthMm = 2390; depthMm <= 2410; depthMm += 1) {
      const loaded = load(
        storedAt({ emptyColumns: [wallASpaceOfDepth(depthMm)] }),
      );

      expect({ depthMm, widthMm: loaded.room.widthMm }).toEqual({
        depthMm,
        widthMm: CORRECTED_WIDTH_MM,
      });
    }
  });
});

// **Attack 2 — ADR 0052's property, stated as a property.**
//
// The record's whole reason for keeping guard 2 is *"a `/d/{id}` link that loaded before the
// correction must not stop loading because of it"*. That is a claim about **every** document at the
// pre-correction pair, not about one wall-B space at 3580, and it is exactly what a guard drifting
// towards "always correct" breaks. Swept over both walls at once, because the correction moves both
// dimensions and in opposite directions.
describe("no document that loaded before the correction stops loading because of it", () => {
  function storedWithBothSpaces(depths: {
    readonly wallA: number;
    readonly wallB: number;
  }): Design {
    return asDesign(
      storedAt({
        emptyColumns: [
          wallASpaceOfDepth(depths.wallA),
          wallBSpaceOfDepth(depths.wallB),
        ],
      }),
    );
  }

  /** Wide enough to reach every relation between a space and the two rooms, and **weighted onto
   *  the two transitions**, which is what a uniform draw over 1–4000 gets wrong: the band that makes
   *  the guard decline is 40 mm of 4000, so a uniform sweep of 600 runs misses it outright about one
   *  run in forty and the non-vacuity counters below then fail for a reason that is not a defect.
   *  The wide arm is kept, so nothing outside the bands stops being swept. */
  const spaceDepth = (transition: {
    readonly min: number;
    readonly max: number;
  }): fc.Arbitrary<number> =>
    fc.oneof(fc.integer({ min: 1, max: 4000 }), fc.integer(transition));

  const depthPairs = fc.record({
    wallA: spaceDepth({ min: 2350, max: 2900 }),
    wallB: spaceDepth({ min: 3500, max: 3650 }),
  });

  it("loads every such document, over a swept pair of space depths", () => {
    let loadable = 0;
    fc.assert(
      fc.property(depthPairs, (depths) => {
        const stored = storedWithBothSpaces(depths);
        fc.pre(fatalKeysOf(stored).length === 0);
        loadable += 1;

        expect(() => load(storedWithBothSpaces(depths))).not.toThrow();
      }),
      { numRuns: 600 },
    );

    expect(loadable).toBeGreaterThan(0);
  });

  // The same sweep read the other way, and the one that fails if the guard over-declines: the room
  // is corrected on exactly the documents whose correction creates nothing.
  it("corrects exactly when the correction creates no fatal finding, over the same sweep", () => {
    let corrected = 0;
    let declined = 0;
    fc.assert(
      fc.property(depthPairs, (depths) => {
        const stored = storedWithBothSpaces(depths);
        fc.pre(fatalKeysOf(stored).length === 0);
        const created = fatalFindingsTheCorrectionCreates(stored);

        const loaded = load(storedWithBothSpaces(depths));
        if (created.length === 0) corrected += 1;
        else declined += 1;

        expect(loaded.room.widthMm).toBe(
          created.length === 0
            ? CORRECTED_WIDTH_MM
            : PRE_CORRECTION_ROOM.widthMm,
        );
      }),
      { numRuns: 600 },
    );

    // Both branches reached, so neither is passing because the sweep never generated it.
    expect(corrected).toBeGreaterThan(0);
    expect(declined).toBeGreaterThan(0);
  });
});

// **Attack 3 — acceptance criterion 4, against a family rather than against the one code.**
//
// *"For any document whose room is the pre-correction pair, the guard's answer is unchanged by any
// finding present under both rooms."* The record discharges it with
// `PLACEMENT_WEARS_UNOFFERED_FINISH`, which is the code that raised it. A rule stated for every code
// is worth testing with several, and each one below is first **measured** to be room-invariant
// rather than assumed to be: an injection whose findings differ across the two rooms would falsify
// the rule as stated, not the implementation.
describe("a finding the document carries under both rooms cannot change the guard's answer", () => {
  /** A space the *stored* room refuses and the corrected one does not, so which room the document
   *  was holding when it failed is legible in the refusal's own text — the only observable a
   *  document that refuses either way leaves behind. */
  const ROOM_DEPENDENT_PROBE = wallASpaceOfDepth(2500);
  const PROBE_FINDING = "emptyColumns.0.depthMm:EMPTY_COLUMN_DEEPER_THAN_ROOM";

  /** The base the correction fires on, and the base it declines on. */
  const SPACES_THE_CORRECTION_RESCUES = [ROOM_DEPENDENT_PROBE];
  const SPACES_THE_CORRECTION_BREAKS = [
    ROOM_DEPENDENT_PROBE,
    wallBSpaceOfDepth(3580),
  ];

  /** The one injection the load path resolves before it asserts, so its document loads rather than
   *  refusing — ADR 0078 decision 2, and the code that raised ADR 0085. */
  const UNOFFERED_FINISH_INJECTION = "a finish the material does not offer";

  const INJECTIONS: ReadonlyMap<string, (design: Design) => Design> = new Map([
    [
      UNOFFERED_FINISH_INJECTION,
      (design: Design): Design => ({
        ...design,
        settings: { ...design.settings, materialTierId: "material.veneer" },
        placements: design.placements.map((placement, index) =>
          index === 0
            ? {
                ...placement,
                body: {
                  ...placement.body,
                  finish: paletteFinish("pal.antracit"),
                },
              }
            : placement,
        ),
      }),
    ],
    [
      "two placements sharing an id",
      (design: Design): Design => ({
        ...design,
        placements: design.placements.map((placement, index) =>
          index === 1
            ? { ...placement, id: design.placements[0]?.id ?? placement.id }
            : placement,
        ),
      }),
    ],
    [
      "a body the catalogue does not cover",
      (design: Design): Design => ({
        ...design,
        placements: design.placements.map((placement, index) =>
          index === 0
            ? {
                ...placement,
                body: { ...placement.body, buildId: "no-such-body" },
              }
            : placement,
        ),
      }),
    ],
    [
      "timestamps out of order",
      (design: Design): Design => ({
        ...design,
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      }),
    ],
  ]);

  function storedWith(
    emptyColumns: readonly EmptyColumn[],
    inject?: (design: Design) => Design,
  ): unknown {
    const base = asDesign(storedAt({ emptyColumns: [...emptyColumns] }));
    return JSON.parse(JSON.stringify(inject ? inject(base) : base)) as unknown;
  }

  /** Which room the load settled on, whether it then refused or not. */
  function guardAnswerFor(raw: unknown): string {
    try {
      return load(raw).room.widthMm === CORRECTED_WIDTH_MM
        ? "corrected"
        : "declined";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The probe is fatal under the stored room only, so its presence in the refusal is the
      // document saying which room it was holding when it failed.
      return message.includes(PROBE_FINDING) ? "declined" : "corrected";
    }
  }

  /** What one injection adds to the fatal set, under one room. */
  function findingsAddedUnder(
    room: Design["room"],
    emptyColumns: readonly EmptyColumn[],
    inject: (design: Design) => Design,
  ): readonly string[] {
    const base = atRoom(
      asDesign(storedAt({ emptyColumns: [...emptyColumns] })),
      room,
    );
    const carried = new Set(fatalKeysOf(base));
    return fatalKeysOf(inject(base)).filter((key) => !carried.has(key));
  }

  it("reads the guard's answer off both bases before any injection", () => {
    expect(guardAnswerFor(storedWith(SPACES_THE_CORRECTION_RESCUES))).toBe(
      "corrected",
    );
    expect(guardAnswerFor(storedWith(SPACES_THE_CORRECTION_BREAKS))).toBe(
      "declined",
    );
  });

  it("adds the same fatal findings under both rooms, for every injection", () => {
    for (const [name, inject] of INJECTIONS) {
      for (const spaces of [
        SPACES_THE_CORRECTION_RESCUES,
        SPACES_THE_CORRECTION_BREAKS,
      ]) {
        const underStored = findingsAddedUnder(
          PRE_CORRECTION_ROOM,
          spaces,
          inject,
        );
        const underCorrected = findingsAddedUnder(
          CORRECTED_ROOM,
          spaces,
          inject,
        );

        // Non-empty, so the sweep is not passing over injections that add nothing at all.
        expect({ name, added: underStored.length > 0 }).toEqual({
          name,
          added: true,
        });
        expect({ name, keys: underCorrected }).toEqual({
          name,
          keys: underStored,
        });
      }
    }
  });

  /** ADR 0069 decision 5's table, first row: *"the corrected room is not the answer to this
   *  document's problems"*. The comparison keeps it by letting the document fail on its own terms
   *  rather than by declining the correction — so the thing to assert is that it still fails. */
  it("still refuses every injected document whose finding the load path does not resolve", () => {
    for (const [name, inject] of INJECTIONS) {
      if (name === UNOFFERED_FINISH_INJECTION) continue;

      expect({
        name,
        refused: (() => {
          try {
            load(storedWith(SPACES_THE_CORRECTION_RESCUES, inject));
            return false;
          } catch {
            return true;
          }
        })(),
      }).toEqual({ name, refused: true });
    }
  });

  /** The premise the whole comparison rests on: the two validations it runs differ only because the
   *  rooms differ. A validator that read a clock, a module-level cache or an insertion order would
   *  make the guard's answer a coin flip, and nothing else in the suite asks. */
  it("reports the same fatal findings twice for one document, on both rooms", () => {
    const stored = asDesign(
      storedAt({ emptyColumns: SPACES_THE_CORRECTION_BREAKS }),
    );

    for (const room of [PRE_CORRECTION_ROOM, CORRECTED_ROOM]) {
      const at = atRoom(stored, room);

      expect(fatalKeysOf(at)).toEqual(fatalKeysOf(at));
    }
  });

  it("leaves the guard's answer unchanged, for every injection, on both bases", () => {
    for (const [name, inject] of INJECTIONS) {
      expect({
        name,
        rescues: guardAnswerFor(
          storedWith(SPACES_THE_CORRECTION_RESCUES, inject),
        ),
        breaks: guardAnswerFor(
          storedWith(SPACES_THE_CORRECTION_BREAKS, inject),
        ),
      }).toEqual({ name, rescues: "corrected", breaks: "declined" });
    }
  });
});

// **Attack 4 — the `path:code` key itself.**
//
// The guard identifies a finding by joining a path and a code with a colon. Two distinct findings
// that join to one string would be silently treated as the same finding, and the one that is
// created would go unnoticed. Nothing about `DesignValidationIssue` forbids a colon in a path; what
// forbids it is that every path this validator builds is dot-joined field names and array indices.
describe("no validation path can forge the key the guard compares on", () => {
  /** A document built to produce as many findings, of as many codes, as one document can carry. */
  function documentCarryingManyFindings(): Design {
    const brokenPlacement = (placement: DesignPlacement): DesignPlacement => ({
      ...placement,
      alongMm: -50,
      body: { ...placement.body, widthMm: 1, heightMm: 9000 },
    });
    return asDesign(
      storedAt({
        placements: KITCHEN_L_DESIGN.placements.map(brokenPlacement),
        emptyColumns: [
          wallASpaceOfDepth(9000),
          wallBSpaceOfDepth(9000),
          {
            wall: "A",
            alongMm: -10,
            widthMm: 20,
            y0Mm: 900,
            topMm: 400,
            depthMm: 600,
          },
        ],
        columnExtents: [
          {
            wall: "B",
            alongMm: 3550,
            widthMm: 40,
            y0Mm: 0,
            topMm: 9000,
            depthMm: 9000,
          },
        ],
      }),
    );
  }

  it("builds every path out of dot-joined segments, over a document carrying many codes", () => {
    const issues = validateDesignForCatalog(
      documentCarryingManyFindings(),
      CATALOG,
    );

    expect(issues.length).toBeGreaterThan(5);
    expect(new Set(issues.map((issue) => issue.code)).size).toBeGreaterThan(1);
    expect(issues.filter((issue) => issue.path.includes(":"))).toEqual([]);
  });
});

// **Attack 5 — the row of ADR 0069 decision 5's table the comparison was *not* allowed to change.**
//
// *"One body still reaches past the end of a wall after the correction"* is a **mark**, not a
// failure to rescue (ADR 0065), and it was already dropped from guard 2 before this record. A
// comparison that started counting marks would decline the correction for exactly the documents the
// correction exists for — the seeded rows whose runs end at 2800 — so it is worth asserting that the
// guard still sees nothing here.
describe("a run left past the end of a wall by the correction does not veto it", () => {
  /** Inside wall A's stored 3600 bound and past its corrected 3560 one, which is
   *  `EMPTY_COLUMN_PAST_WALL_END` — a mark under `DESIGN_ISSUE_SEVERITY_BY_CODE`. */
  const PAST_THE_CORRECTED_WALL_END: EmptyColumn = {
    wall: "A",
    alongMm: 3550,
    widthMm: 100,
    y0Mm: 900,
    topMm: 1400,
    depthMm: 600,
  };

  it("corrects the room, and the load carries the mark rather than refusing it", () => {
    const stored = asDesign(
      storedAt({ emptyColumns: [PAST_THE_CORRECTED_WALL_END] }),
    );
    const marksUnderTheCorrectedRoom = validateDesignForCatalog(
      atRoom(stored, CORRECTED_ROOM),
      CATALOG,
    ).map((issue) => issue.code);

    // The witness is only worth something if the correction is what creates the mark.
    expect(marksUnderTheCorrectedRoom).toContain("EMPTY_COLUMN_PAST_WALL_END");
    expect(
      validateDesignForCatalog(stored, CATALOG).map((issue) => issue.code),
    ).not.toContain("EMPTY_COLUMN_PAST_WALL_END");

    const loaded = load(
      storedAt({ emptyColumns: [PAST_THE_CORRECTED_WALL_END] }),
    );

    expect(loaded.room.widthMm).toBe(CORRECTED_WIDTH_MM);
  });
});
