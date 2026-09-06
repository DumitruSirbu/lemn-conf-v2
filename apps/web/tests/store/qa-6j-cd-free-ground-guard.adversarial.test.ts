// Adversarial QA for wave 6J-d's free-ground guard, and for the round trip it is asked to protect.
//
// **What is attacked here.** `cabinet-depth-frozen-map.test.ts`'s *"the free-ground guard is idle,
// and is not hiding the rule"* asserts, in ten scenario/variant cases, that
// `clipEmptyColumnsToFreeGround(state.columns, state.records)` returns its input **by identity**, and
// reads that as *"the guard is idle and the validated document is the pre-clip document"*.
//
// It cannot mean that. `state.columns` has already been through that same pass — twice, once inside
// `frozenMapAtCabinetDepth` and once in the store's own funnel — and the pass only ever removes, so
// running it again over its own output is identity **whatever it did the first time**. The first case
// below demonstrates that on a map where the guard provably fired.
//
// The claim itself is true — the second case measures it the way the criterion means it, by the size
// and the coordinates of the published map across the change rather than by re-asking the guard. So
// this file replaces the instrument, not the criterion.
//
// The third case is a defect the branch introduces and no criterion covers.
import {
  buildKitchenLBodyCatalog,
  clipEmptyColumnsToFreeGround,
  DEFAULT_CABINET_DEPTH_MM,
  DesignSchema,
  fatalDesignValidationIssues,
  KITCHEN_L_DESIGN,
  validateDesignForCatalog,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-06T14:00:00.000Z";
const DEEPER_MM = 700;

/** The five cleared scenarios the wave's own suites build. */
const CLEARED_SCENARIOS: readonly (readonly [string, readonly string[]])[] = [
  ["a cleared wall column", ["p8", "p15"]],
  ["a cleared base slot", ["p1", "p12", "p18"]],
  ["a cleared appliance niche", ["p7", "p24"]],
  ["a cleared oven tower", ["p5", "p22"]],
  ["a cleared pantry", ["p6", "p23"]],
];

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function removeAll(store: Store, ids: readonly string[]): Store {
  for (const id of ids) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    expect(store.getState().lastRejection, `remove ${id}`).toBeNull();
  }
  return store;
}

function setDepth(store: Store, cabinetDepthMm: number): Store {
  store.getState().setCabinetDepth(cabinetDepthMm);
  expect(
    store.getState().lastRejection,
    `set ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

/** The same document with every recorded source stripped — a session before wave 6K-c. */
function asLegacyDocument(store: Store): Store {
  const strip = (entry: EmptyColumn): EmptyColumn => {
    const stripped = { ...entry };
    delete stripped.depthFromBuildId;
    return stripped;
  };
  const held = store.getState().design;
  return createStore(
    DesignSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...held,
          emptyColumns: (held.emptyColumns ?? []).map(strip),
          columnExtents: (held.columnExtents ?? []).map(strip),
        }),
      ),
    ),
  );
}

/** Every recorded space and extent, by the wall it stands on and the box it occupies — the
 *  positioned half of the frozen map, which is the half a drop would remove and a clip would narrow.
 *
 *  **Deliberately without `depthMm` and without the along-wall coordinate.** Both are functions of
 *  the setting by design: ADR 0073's depth axis is re-answered at the new catalogue and ADR 0090's
 *  along-wall axis slides with the run. What must not change is that the same runs are still there
 *  and still the customer's own width. */
function storedRuns(store: Store): readonly string[] {
  const { design } = store.getState();
  return [...(design.emptyColumns ?? []), ...(design.columnExtents ?? [])]
    .map(
      (entry) =>
        `${entry.wall} w${String(entry.widthMm)} y${String(entry.y0Mm)} t${String(entry.topMm)}`,
    )
    .sort();
}

describe("what re-running the guard over a published map can and cannot say", () => {
  // **The instrument, falsified.** The guard is asked again over a map it has already filtered, so
  // identity is what it returns even on the one map in the suite where it provably did work. A
  // predicate that answers the same on both sides of the question it is asked is not evidence for
  // either side.
  it("returns identity even on a map it has just dropped a column from", () => {
    const { columns, records } = removeAll(createStore(), [
      "p5",
      "p22",
    ]).getState();
    const stranded = [...columns.values()].find(
      (column) => !records.some((record) => record.col === column.key),
    );
    if (!stranded) throw new Error("no member-less column to strand");
    const onOccupiedGround = new Map(columns).set(stranded.key, {
      ...stranded,
      w: 2.4,
    });

    const clipped = clipEmptyColumnsToFreeGround(onOccupiedGround, records);

    // The guard did work: a column is gone.
    expect(clipped).not.toBe(onOccupiedGround);
    expect(clipped.size).toBe(onOccupiedGround.size - 1);
    // And re-asking it returns identity — the exact predicate the wave's suite reads as "idle".
    expect(clipEmptyColumnsToFreeGround(clipped, records)).toBe(clipped);
  });
});

describe("the guard is idle, measured on the map rather than on the guard", () => {
  // **The criterion the wave states, with an instrument that can fail it.** A dropped column is a
  // recorded run that leaves the document, so the falsifiable form is the *population* of recorded
  // runs across the change: same count, same widths, same vertical intervals, same depths, at both
  // settings and on a legacy document. Under ADR 0090's struck decision 4a this fired in five of six
  // wall-B legacy scenarios, so a rule that regressed to it would lose runs here.
  it.each(CLEARED_SCENARIOS)(
    "%s keeps every recorded run through the change, sourced and legacy",
    (_name, members) => {
      for (const legacy of [false, true]) {
        const cleared = removeAll(createStore(), members);
        const store = legacy ? asLegacyDocument(cleared) : cleared;
        const held = storedRuns(store);
        expect(held.length, "nothing to lose").toBeGreaterThan(0);

        setDepth(store, DEEPER_MM);
        expect(storedRuns(store), `at 700, legacy=${String(legacy)}`).toEqual(
          held,
        );

        setDepth(store, DEFAULT_CABINET_DEPTH_MM);
        expect(
          storedRuns(store),
          `back at 600, legacy=${String(legacy)}`,
        ).toEqual(held);
      }
    },
  );
});

describe("a recorded space flush to the end of wall B", () => {
  /** The fridge cleared and its space recorded **against wall B's own end** — 2320..2920 in a
   *  2920 mm room. A document the wire schema accepts and `validateDesignForCatalog` reports
   *  nothing about, so it is a document the `PUT` seam stores and a later session loads. */
  function withASpaceAtTheWallEnd(): Design {
    const wallEndMm = KITCHEN_L_DESIGN.room.depthMm;
    const widthMm = 600;
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id !== "p7" && placement.id !== "p24",
      ),
      emptyColumns: [
        {
          wall: "B",
          alongMm: wallEndMm - widthMm / 2,
          widthMm,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 742,
          depthFromBuildId: "fridge-free-700",
        },
      ],
    };
  }

  it("is a document the product accepts", () => {
    const design = withASpaceAtTheWallEnd();

    expect(
      DesignSchema.safeParse(JSON.parse(JSON.stringify(design))).success,
    ).toBe(true);
    expect(
      fatalDesignValidationIssues(
        validateDesignForCatalog(design, buildKitchenLBodyCatalog(600)),
      ),
    ).toEqual([]);
  });

  // **A defect this branch introduces.** The slide runs before `clipEmptyColumnsAtWallEnd`, so a
  // space the deeper setting pushes past wall B's end is cut to fit — correctly, that is the owner's
  // ruling on ADR 0069 — and then the return to 600 slides the *cut* value back. 600 mm of the
  // customer's recorded space becomes 500 mm and does not come back.
  //
  // ADR 0090's amendment states the contrary claim in terms: *"under the ladder there is no loss to
  // surface, because every space returns on every reachable document, legacy or current-schema"*, and
  // separately that *"permitting a loss and a customer silently losing a space they can see are
  // different claims"*. This is the second one.
  //
  // Measured against `e28ab25` in the same 2920 mm room: there the space is 600 mm wide at 600, at
  // 700 and back, because nothing slid it into the wall. Wave 6J-d's own round-trip criteria do not
  // reach it — they are asserted on the oven-tower scenario, which sits 1100 mm short of the wall.
  it("comes back the width it went in at", () => {
    const store = createStore(withASpaceAtTheWallEnd());
    const held = store.getState().design.emptyColumns;
    const heldWidthMm = held?.[0]?.widthMm;

    setDepth(store, DEEPER_MM);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    const returned = store.getState().design.emptyColumns;
    // The width first, so the failure names the loss rather than a whole-entry mismatch: 600 mm of
    // recorded space goes in and 500 mm comes back.
    expect(returned?.[0]?.widthMm).toBe(heldWidthMm);
    expect(returned).toStrictEqual(held);
  });
});
