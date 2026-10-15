// Adversarial QA for wave 6K-d — **the second deepening**, which no measurement in the wave reaches.
//
// Every round trip the wave ships starts from `KITCHEN_L_DESIGN`, and that fixture carries **no**
// `seatDepthMm` on any placement. So the first `600 -> 700` derives every opening from
// `definition.frameDepthMm` at the new depth, which is right by construction. The trips then end at
// 600 and assert the return.
//
// **A customer who deepens a second time is on a different code path**, because by then the document
// carries seats. `deriveFrame` resolves `placement.body.seatDepthMm ?? definition.frameDepthMm`
// (ADR 0011 Gap B), `rebuildEveryBodyAt` re-derives the columns from those records with `{}` frozen
// extents, and `rebuild` builds each body to the **opening** — so a wall run whose every member
// carries the shallow seat derives a shallow opening and rebuilds itself shallow again.
//
// `set-cabinet-depth.ts`'s own `reseat` comment names this mechanism exactly, one branch over, and
// says why it takes the catalogue's declaration instead: *"the moment this function has written a
// seat, that `??` takes the stored one and the new catalogue's number is never consulted again."*
// The `rebuild` arm has no such protection.
//
// **Not a drift and not compounding** — measured, both here and against the real adapter probe: the
// affected seats stick at the shallower value rather than walking. That makes it a stuck body, not
// the 39-mm-per-change walk this milestone already closed.
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  DEFAULT_CABINET_DEPTH_MM,
  DesignSchema,
  KITCHEN_L_DESIGN,
  wallCarcassDepthMm,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { columnKeyAt } from "../support/wall-b-column-keys";

const OCCURRED_AT = "2026-09-05T11:00:00.000Z";
const DEEPER_MM = 700;

/** The two wall-A columns whose every member is a fronted wall cabinet, so §3.2's MAX over them is a
 *  pure function of what those bodies were last rebuilt to. Named because they are the ones that
 *  stick; the wall-B column and the columns holding a deeper top are not affected and are asserted
 *  alongside so the claim is about these and not about wall bodies in general. */
const STUCK_KEYS = ["A|0.30", "A|0.75"] as const;
const UNAFFECTED_KEY = "B|0.61";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function columnDepthMm(store: Store, key: string): number {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return Math.round(column.d * 1000);
}

function change(store: Store, ...depthsMm: readonly number[]): Store {
  for (const depthMm of depthsMm) store.getState().setCabinetDepth(depthMm);
  return store;
}

/** The design as a save and a reload would deliver it — through the wire schema, so a document this
 *  accepts is one the API would have stored and returned. */
function reload(store: Store): Store {
  return createStore(
    DesignSchema.parse(JSON.parse(JSON.stringify(store.getState().design))),
  );
}

describe("a kitchen deepened for the second time", () => {
  // The premise, so nothing below is a claim about a fixture that already carries seats: the first
  // deepening is the one the wave measures, and it is correct.
  it("is correct the first time, which is what the wave measures", () => {
    const store = change(createStore(), DEEPER_MM);

    for (const key of STUCK_KEYS) {
      expect(columnDepthMm(store, key), key).toBe(
        wallCarcassDepthMm(DEEPER_MM),
      );
    }
  });

  // **"Second" is the wrong word, and this is the sharper statement of the same defect.** What
  // matters is not how many changes have happened but whether the wall cabinets already carry a seat
  // written at the shallower depth — and settling at 600 writes one. So a customer whose stored
  // document has been through *any* command at 600 hits this on their **first** deepening, and every
  // saved design is such a document.
  it("deepens a design that merely settled at the shallower depth first", () => {
    const store = change(createStore(), DEFAULT_CABINET_DEPTH_MM, DEEPER_MM);

    for (const key of STUCK_KEYS) {
      expect(columnDepthMm(store, key), key).toBe(
        wallCarcassDepthMm(DEEPER_MM),
      );
    }
  });

  // **The finding.** The customer tries 700, goes back to 600, then commits to 700. The wall run
  // publishes the 600 mm kitchen's wall depth in a 700 mm kitchen, beside base runs that did deepen.
  it("deepens its wall run on the way back to the deeper setting", () => {
    const store = change(
      createStore(),
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );

    expect(store.getState().design.settings?.cabinetDepthMm).toBe(DEEPER_MM);
    for (const key of STUCK_KEYS) {
      expect(columnDepthMm(store, key), key).toBe(
        wallCarcassDepthMm(DEEPER_MM),
      );
    }
  });

  // Against the design that reached 700 by the shortest path — an independent route to the same
  // kitchen, so the oracle is not this store's own arithmetic.
  it("writes the seats a kitchen that went straight there writes", () => {
    const looped = change(
      createStore(),
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );
    const straight = change(createStore(), DEEPER_MM);

    expect(seatsOf(looped)).toEqual(seatsOf(straight));
  });

  // The stuck value does not walk: a third and a fourth deepening leave it exactly where the second
  // did. Recorded so the finding is not mistaken for the compounding one this milestone closed.
  it("sticks rather than drifting, over three more visits", () => {
    const twice = change(
      createStore(),
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );
    const afterTwo = STUCK_KEYS.map((key) => columnDepthMm(twice, key));

    const more = change(
      twice,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );

    expect(STUCK_KEYS.map((key) => columnDepthMm(more, key))).toEqual(afterTwo);
  });

  // The blast radius, asserted so the finding is not read as wider than it is: the wall-B column and
  // every base column come back correct, which is why a green suite did not see this.
  it("leaves the other columns right, which is why nothing caught it", () => {
    const store = change(
      createStore(),
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );
    const straight = change(createStore(), DEEPER_MM);

    // Both stores end at the deeper setting, where wall B's run stands 70 mm further along than it
    // does at 600 (ADR 0090 decision 2) — so the key is read at that setting on both sides. The
    // claim is the one it always was: the wall-B column is the same depth however many legs it took
    // to get here.
    const key = columnKeyAt(UNAFFECTED_KEY, DEEPER_MM);
    expect(columnDepthMm(store, key)).toBe(columnDepthMm(straight, key));
  });

  // **The durable half.** "Wrong for this session" and "wrong for good" are different defects, and
  // only the second one matters to a customer who closes the tab: the seats go through the wire
  // schema and come back, and changing back to 600 from the reloaded document does not repair them.
  it("survives a save, a reload and a change back", () => {
    const deepened = change(
      createStore(),
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );

    const reloaded = change(
      reload(deepened),
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
    );

    const straight = change(createStore(), DEEPER_MM);
    expect(seatsOf(reloaded)).toEqual(seatsOf(straight));
  });
});

// **The direction question, swept rather than sampled.** The 39 mm walk this milestone closed ran in
// both directions and only one was found, so this asks the same of the defect above: every sequence
// of four changes over the two declared depths, each compared against the design that reached the
// same terminal depth by the shortest path.
//
// **Measured 2026-09-05, with the real adapter probe and again here: the shallowing direction is
// clean.** All eight sequences ending at 600 match the straight path exactly — nothing is left at
// the deep shell in a shallow kitchen. Seven of the eight ending at 700 do not; the only one that
// does is `700 -> 700 -> 700 -> 700`, which never carried a 600 mm seat to begin with. The defect is
// **deepening-only**, and it is a body that sticks rather than one that walks.
describe("every order the two settings can be applied in", () => {
  const SEQUENCES: readonly (readonly number[])[] = [600, 700].flatMap((a) =>
    [600, 700].flatMap((b) =>
      [600, 700].flatMap((c) => [600, 700].map((d) => [a, b, c, d])),
    ),
  );

  // Not a vacuous sweep: both terminal depths must be represented, or "the shallowing direction is
  // clean" would be a claim about an empty half.
  it("sweeps both terminal depths", () => {
    // "Both" is a claim about the product: the sequences are every order of 600 and 700, which is every order
    // there is only while those two are all the depths a kitchen can be built at. A third declared depth leaves the
    // sweep above a third short, and the count of sixteen below would not say so.
    expect([...declaredCabinetDepthsMm()]).toEqual([600, 700]);
    expect(SEQUENCES).toHaveLength(16);
    for (const terminal of [DEFAULT_CABINET_DEPTH_MM, DEEPER_MM]) {
      expect(
        SEQUENCES.filter((sequence) => sequence.at(-1) === terminal).length,
      ).toBe(8);
    }
  });

  // The clean half, asserted so the finding's direction is evidence rather than an impression.
  it.each(SEQUENCES.filter((sequence) => sequence.at(-1) === 600))(
    "leaves nothing at the deep shell after %j",
    (...sequence: readonly number[]) => {
      const walked = change(createStore(), ...sequence);
      const straight = change(createStore(), DEFAULT_CABINET_DEPTH_MM);

      expect(seatsOf(walked)).toEqual(seatsOf(straight));
    },
  );

  // The broken half. `700,700,700,700` is excluded and named: it never holds a 600 mm seat, so it is
  // the one deepening sequence the defect cannot reach — listing it here rather than filtering it
  // silently is what stops the exclusion growing.
  it.each(
    SEQUENCES.filter(
      (sequence) =>
        sequence.at(-1) === DEEPER_MM &&
        sequence.some((depthMm) => depthMm === DEFAULT_CABINET_DEPTH_MM),
    ),
  )(
    "reaches the deep kitchen's own seats after %j",
    (...sequence: readonly number[]) => {
      const walked = change(createStore(), ...sequence);
      const straight = change(createStore(), DEEPER_MM);

      expect(seatsOf(walked)).toEqual(seatsOf(straight));
    },
  );
});

/** Every placement's recorded seat, keyed by placement id. The field `rebuild` and `reseat` write and
 *  the one `deriveFrame` reads back forever. */
function seatsOf(store: Store): ReadonlyMap<string, number | undefined> {
  return new Map(
    store
      .getState()
      .design.placements.map((placement) => [
        placement.id,
        placement.body.seatDepthMm,
      ]),
  );
}
