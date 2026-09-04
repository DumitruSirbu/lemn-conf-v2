// Wave 6K-h — **a depth change plans against the catalogue, not against the seats it is about to
// replace** (ADR 0077 decision 8, in that record's Addendum of 2026-09-05).
//
// A recorded seat carries a qualifier the number does not: the setting it was measured at. It is
// authoritative for the design at that setting and for nothing else, so the command that *changes*
// the setting must not read one as an input to what it builds — not directly, and not through a
// column derived from one. Left in, `deriveFrame` resolves `seatDepthMm ?? frameDepthMm` (ADR 0011
// Gap B), §3.2's `Column.d` is a MAX over frames measured at the depth being left, and
// `resolveDepthM`'s capped arm returns `min(declared 400, stale 330)` — a 600 mm wall shell built,
// measured and persisted in a 700 mm kitchen.
//
// **Two things a reasonable test gets wrong, and both are asserted here rather than assumed.**
//
//  - The trigger is a **state** — every depth-following member of a column carrying a seat from
//    another setting — and not a change count. `KITCHEN_L_DESIGN` is the only seatless state there
//    is, so "change the depth twice" from it proves nothing; the two routes below reach the state
//    the way a customer does.
//  - `Column.d` is a MAX, so **one** stale member is rescued by any deeper sibling. Both halves are
//    asserted, so the rescue is pinned as behaviour instead of quietly carrying a test.
//
// The fake probe this file runs against is honest about the front assembly (wave 6K-d's correction):
// it reads the entry's own `occupiedDepth` declaration, so a `recorded-shell` body reports the shell
// it was asked for less its front. A fake that answered the depth it was handed could not see any of
// this. The same measurements against the **real** adapter probe are
// `packages/three-adapter/tests/qa-6k-de-repeated-real-probe.adversarial.test.ts`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  wallCarcassDepthMm,
  wallCarcassSeatDepthMm,
} from "../../src/catalog.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
} from "../../src/void-engine.js";
import {
  DEFAULT_CABINET_DEPTH_MM,
  WALL_FRONT_ASSEMBLY_MM,
} from "../../src/worktop-depth.js";
import {
  createFakeProbe,
  createFakeProbeFactory,
} from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** One factory for the whole file. A depth change is a real rebuild of every body, and the property
 *  below runs a hundred sequences of them; the factory still builds a probe per change, which is the
 *  contract, but nothing rebuilds a catalogue that could have been shared. */
const PROBE_AT = createFakeProbeFactory();

/** The two wall-A columns whose every member is a fronted wall cabinet, so §3.2's MAX over them is a
 *  pure function of what those bodies were last rebuilt to — the only two the defect reaches. */
const STUCK_KEYS = ["A|0.30", "A|0.75"] as const;

/** Their members: `p8` and `p15` in `A|0.30`, `p10` and `p16` in `A|0.75`. */
const STUCK_PLACEMENT_IDS = ["p8", "p10", "p15", "p16"] as const;

/** Columns the change must leave exactly where the broken command already left them, with the depth
 *  the ruling's own simulation measured at 700 mm. Written out rather than only compared against a
 *  straight run, because "byte-identical between the broken and the fixed command" is the statement,
 *  and a fix that widened past the declared entries would move one of these while every
 *  same-versus-same comparison stayed green.
 *
 *  **`B|0.61` is deliberately absent, and its exclusion is named rather than silent.** It is the
 *  column whose members travel `reseat`, and the fake probe seats a `wall-plane` body at its
 *  declared `frameDepthMm` where the real one measures the built return — 361 here against the
 *  adapter's 400. That is a fake-fidelity difference and not a behaviour, so the number belongs in
 *  the real-probe suite; the assertion below still holds `B|0.61` to the straight path's value. */
const UNTOUCHED_DEPTHS_AT_700_MM: ReadonlyMap<string, number> = new Map([
  ["A|1.30", 720],
  ["B|1.20", 738],
  ["B|1.80", 699],
  // The freestanding fridge: a manufactured size, and the column ADR 0058's pinned top stands in.
  ["B|2.45", 742],
]);

/** The column key it publishes now — read off the record rather than written down, because ADR
 *  0031's resize moves the column it rebuilds and the key is its centre. */
function columnKeyOf(
  design: Design,
  cabinetDepthMm: number,
  placementId: string,
): string {
  const record = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  ).find((candidate) => candidate.id === placementId);
  if (!record) throw new Error(`no record for ${placementId}`);
  return record.col;
}

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: PROBE_AT,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function columnDepthsMm(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<string, number> {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  return new Map(
    [...deriveColumns(records, {}, design.room)].map(([key, column]) => [
      key,
      Math.round(column.d * 1000),
    ]),
  );
}

function columnDepthMm(
  design: Design,
  cabinetDepthMm: number,
  key: string,
): number {
  const depthMm = columnDepthsMm(design, cabinetDepthMm).get(key);
  if (depthMm === undefined) throw new Error(`no column ${key} is published`);
  return depthMm;
}

/** Every placement's recorded seat, keyed by id — the field `rebuild` and `reseat` write and the one
 *  `deriveFrame` reads back forever. */
function seatsById(design: Design): ReadonlyMap<string, number | undefined> {
  return new Map(
    design.placements.map((placement) => [
      placement.id,
      placement.body.seatDepthMm,
    ]),
  );
}

function seatMm(design: Design, placementId: string): number | undefined {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`no placement ${placementId}`);
  return placement.body.seatDepthMm;
}

function bodyOf(design: Design, placementId: string): DesignPlacement["body"] {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`no placement ${placementId}`);
  return placement.body;
}

/** The seeded fixture with a seat written **by hand** at the shallow setting on the named bodies —
 *  the state, isolated to exactly the members a test means to stale, which no route can produce on
 *  its own. The two routes below are how a customer gets here; this is how the MAX's rescue is
 *  measured one member at a time. */
function withSeatsWrittenAtTheShallowDepth(
  placementIds: readonly string[],
): Design {
  const staleSeatMm = wallCarcassSeatDepthMm(DEFAULT_CABINET_DEPTH_MM);
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placementIds.includes(placement.id)
        ? {
            ...placement,
            body: { ...placement.body, seatDepthMm: staleSeatMm },
          }
        : placement,
    ),
  };
}

describe("the two routes into the state that triggers this", () => {
  // **Route 1: a depth change to the value the design already has.** Pressing *Aplică* on 600 in a
  // 600 mm kitchen rebuilds every body and writes every seat, and the return leg of any round trip
  // is the same thing.
  it("deepens a run whose seats were written by a change to the depth it already had", () => {
    const settled = changeTo(KITCHEN_L_DESIGN, DEFAULT_CABINET_DEPTH_MM);
    // Non-vacuity: the route really did leave the shallow setting's seat on every member, or the
    // deepening below would be the seatless fixture's easy case wearing another name.
    for (const id of STUCK_PLACEMENT_IDS) {
      expect(seatMm(settled, id), id).toBe(
        wallCarcassSeatDepthMm(DEFAULT_CABINET_DEPTH_MM),
      );
    }

    const deepened = changeTo(settled, DEEPER_MM);

    for (const id of STUCK_PLACEMENT_IDS) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEPER_MM));
    }
    for (const key of STUCK_KEYS) {
      expect(columnDepthMm(deepened, DEEPER_MM, key), key).toBe(
        wallCarcassDepthMm(DEEPER_MM),
      );
    }
  });

  // **Route 2: a width command on the wall column**, which rebuilds every member of it (ADR 0031)
  // and seats them all — an entirely different command reaching the same state, so what follows is
  // not a property of `setCabinetDepth`'s own history.
  it("deepens a run whose seats were written by a resize of its own column", () => {
    const resized = afterResizingTheWallColumn();
    for (const id of ["p8", "p15"]) {
      expect(seatMm(resized, id), id).toBe(
        wallCarcassSeatDepthMm(DEFAULT_CABINET_DEPTH_MM),
      );
    }

    const deepened = changeTo(resized, DEEPER_MM);

    for (const id of ["p8", "p15"]) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEPER_MM));
    }
    expect(
      columnDepthMm(
        deepened,
        DEEPER_MM,
        columnKeyOf(deepened, DEEPER_MM, "p8"),
      ),
    ).toBe(wallCarcassDepthMm(DEEPER_MM));
  });
});

/** ADR 0031's resize pointed at `p8`, which resizes the whole column it stands in — one step
 *  narrower, because an unchanged width is refused and a wider one has no empty space to take. */
const RESIZED_WALL_COLUMN_WIDTH_MM = 550;

function afterResizingTheWallColumn(): Design {
  const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  const records = derivePlacementRecords(KITCHEN_L_DESIGN, catalog);
  const result = setWidth({
    design: KITCHEN_L_DESIGN,
    catalog,
    columns: deriveColumns(records, {}, KITCHEN_L_DESIGN.room),
    target: { kind: "placement", id: "p8" },
    widthMm: RESIZED_WALL_COLUMN_WIDTH_MM,
    probe: createFakeProbe({ catalog }),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`resize refused: ${result.reason.code}`);
  return result.design;
}

describe("the MAX over a column, which decides how much of it has to be stale", () => {
  // The rescue, pinned as behaviour: with only `p8` stale, `p15`'s declared 400 wins §3.2's MAX and
  // the column is already right **before** any command runs. This is why a test that seats one body
  // passes while the defect stands.
  it("is rescued by a deeper sibling when one member alone carries a stale seat", () => {
    const oneStale = withSeatsWrittenAtTheShallowDepth(["p8"]);

    expect(columnDepthMm(oneStale, DEEPER_MM, "A|0.30")).toBe(
      wallCarcassDepthMm(DEEPER_MM),
    );
    expect(
      columnDepthMm(changeTo(oneStale, DEEPER_MM), DEEPER_MM, "A|0.30"),
    ).toBe(wallCarcassDepthMm(DEEPER_MM));
  });

  // The other half: with **every** member stale there is no sibling left to rescue the MAX, and the
  // column the command plans against publishes the shallow setting's row. That is the input the fix
  // has to be right on.
  it("deepens the column whose every member carries one, which no sibling can rescue", () => {
    const wholeColumn = withSeatsWrittenAtTheShallowDepth(["p8", "p15"]);
    expect(columnDepthMm(wholeColumn, DEEPER_MM, "A|0.30")).toBe(
      wallCarcassDepthMm(DEFAULT_CABINET_DEPTH_MM),
    );

    const deepened = changeTo(wholeColumn, DEEPER_MM);

    expect(columnDepthMm(deepened, DEEPER_MM, "A|0.30")).toBe(
      wallCarcassDepthMm(DEEPER_MM),
    );
    for (const id of ["p8", "p15"]) {
      expect(seatMm(deepened, id), id).toBe(wallCarcassSeatDepthMm(DEEPER_MM));
    }
  });
});

describe("what the clearing must not reach", () => {
  // **The mirror of the defect being fixed.** A `manufactured-size` body's seat is a fact about a
  // real machine and not about the setting, so it survives the change and keeps its full
  // contribution to the MAX. Clearing every seat instead of the declared ones fails here.
  it("leaves a manufactured size carrying its seat and its whole share of the MAX", () => {
    const fridgeBefore = bodyOf(KITCHEN_L_DESIGN, "p7");

    for (const design of [
      changeTo(KITCHEN_L_DESIGN, DEEPER_MM),
      changeTo(changeTo(KITCHEN_L_DESIGN, DEFAULT_CABINET_DEPTH_MM), DEEPER_MM),
      [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM, DEEPER_MM].reduce(
        changeTo,
        KITCHEN_L_DESIGN,
      ),
    ]) {
      expect(bodyOf(design, "p7")).toStrictEqual(fridgeBefore);
      expect(columnDepthMm(design, DEEPER_MM, "B|2.45")).toBe(742);
    }
  });

  // ADR 0058's two deliberately deep tops, on every path rather than on one change — the existing
  // wave 6J-b suite asserts the single change, and this asserts that a route through the shallow
  // setting does not reach them either.
  it("leaves ADR 0058's pinned tops exactly as they were, on every path", () => {
    const pinnedIds = ["p22", "p23", "p24"] as const;

    const walked = [
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    ].reduce(changeTo, KITCHEN_L_DESIGN);

    for (const id of pinnedIds) {
      expect(bodyOf(walked, id), id).toStrictEqual(
        bodyOf(KITCHEN_L_DESIGN, id),
      );
    }
  });

  // **The case ADR 0011 Gap B exists for, asserted directly.** A `wall-cabinet` over a full-height
  // column is built to the cabinet-depth line rather than the map row, and 661 is a number no
  // catalogue field states — which is exactly why Gap B records it as a seat. It survives the
  // clearing because `resolveDepthM`'s lifted arm reads `column.hasFullHeightUnder`, never
  // `column.d`, and which members stand there is not something clearing a seat can change.
  //
  // The seeded fixture has no such body — its two deep tops are ADR 0058 pins, which do not follow
  // the setting at all — so one is placed here rather than inferred.
  it("rebuilds a wall cabinet over a full-height column to the cabinet-depth line", () => {
    const overTheOvenTower = withAFollowingTopOverTheOvenTower();

    const settled = changeTo(overTheOvenTower, DEFAULT_CABINET_DEPTH_MM);
    expect(seatMm(settled, "p22")).toBe(
      DEFAULT_CABINET_DEPTH_MM - WALL_FRONT_ASSEMBLY_MM,
    );

    // From the state this wave is about: the body already carries the shallow setting's own lifted
    // seat, which is deeper than the map row and so is not the direction the defect ran in.
    const deepened = changeTo(settled, DEEPER_MM);

    expect(seatMm(deepened, "p22")).toBe(DEEPER_MM - WALL_FRONT_ASSEMBLY_MM);
    expect(seatMm(deepened, "p22")).not.toBe(wallCarcassSeatDepthMm(DEEPER_MM));
  });
});

/** The fixture with `p22` — the pinned deep top standing over the oven tower in `B|1.20` — swapped
 *  for the entry that *does* follow the setting, at the same width and height. */
function withAFollowingTopOverTheOvenTower(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === "p22"
        ? {
            ...placement,
            body: { ...placement.body, buildId: "wall-2door-600-top" },
          }
        : placement,
    ),
  };
}

describe("arrival at a depth, whatever path reached it", () => {
  // **Not a claim that a round trip is byte-equal** — ADR 0055 and ADR 0073 decline that, and the
  // frozen extents ADR 0073 owns are deliberately outside this comparison. The claim is the narrower
  // one decision 8 buys: the seats and the columns at the terminal depth are the ones the straight
  // path from the seatless fixture writes.
  //
  // A property over the **ordering**, because that is what the defect is a function of: the 16
  // hand-written sequences are the shape QA had to fall back on before the generator.
  propertyTest.prop([
    fc.array(fc.constantFrom(DEFAULT_CABINET_DEPTH_MM, DEEPER_MM), {
      minLength: 1,
      maxLength: 4,
    }),
  ])(
    "writes the seats and columns of the straight path to the same depth",
    (sequence: readonly number[]) => {
      const terminalMm = sequence.at(-1);
      if (terminalMm === undefined) {
        throw new Error("the generator must produce at least one change");
      }

      const walked = sequence.reduce(changeTo, KITCHEN_L_DESIGN);
      const straight = changeTo(KITCHEN_L_DESIGN, terminalMm);

      expect(seatsById(walked)).toEqual(seatsById(straight));
      expect(columnDepthsMm(walked, terminalMm)).toEqual(
        columnDepthsMm(straight, terminalMm),
      );
    },
  );

  // The blast radius, stated as the columns that must **not** move: the ruling's own simulation has
  // these five byte-identical between the broken command and the fixed one, so a fix that widens
  // past the declared entries shows up here rather than in a green suite.
  it("moves only the two columns the defect reaches", () => {
    const walked = [DEEPER_MM, DEFAULT_CABINET_DEPTH_MM, DEEPER_MM].reduce(
      changeTo,
      KITCHEN_L_DESIGN,
    );

    const depths = columnDepthsMm(walked, DEEPER_MM);
    for (const [key, depthMm] of UNTOUCHED_DEPTHS_AT_700_MM) {
      expect(depths.get(key), key).toBe(depthMm);
    }
    // `B|0.61`'s number is the real probe's to state, but its *stability* is this suite's: it is the
    // one column that was already right in the broken runs, and a fix that moved it would have
    // reached the arm that never read an opening.
    expect(depths.get("B|0.61")).toBe(
      columnDepthsMm(changeTo(KITCHEN_L_DESIGN, DEEPER_MM), DEEPER_MM).get(
        "B|0.61",
      ),
    );
    // The two that may move, so the assertion above is not a claim that nothing moved at all.
    for (const key of STUCK_KEYS) {
      expect(depths.get(key), key).toBe(wallCarcassDepthMm(DEEPER_MM));
    }
  });
});

describe("what a stored document is owed", () => {
  // Nothing is refused and nothing stored is rewritten: the correction happens when a change is
  // applied — a command writing a document — and the document it was handed is left alone.
  it("accepts a document carrying stale seats without touching the one it was given", () => {
    const stale = withSeatsWrittenAtTheShallowDepth([...STUCK_PLACEMENT_IDS]);
    const asHandedIn: unknown = JSON.parse(JSON.stringify(stale));

    const result = setCabinetDepth({
      design: stale,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: DEEPER_MM,
      probeAt: PROBE_AT,
      occurredAt: OCCURRED_AT,
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(stale))).toEqual(asHandedIn);
  });
});
