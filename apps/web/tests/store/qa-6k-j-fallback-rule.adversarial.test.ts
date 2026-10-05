// Adversarial QA on wave 6K-j — an empty space follows the setting, and the fallback is not a
// ratchet ([ADR 0080](../../../../docs/decisions/0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md)).
//
// The wave rewrites one arm of `frozenDepthAtThisSetting`: an extent with no re-answerable source is
// classified by *"was this depth ever more than this rule could have produced at the setting being
// left"*, and only the surplus half keeps the deeper-only MAX. Everything it touches is legacy — a
// document written before wave 6K-c — so the whole file works on documents whose `depthFromBuildId`
// has been removed, which is what those documents look like.
//
// This file attacks the rule itself. `qa-6k-j-closure.adversarial.test.ts` attacks the population
// claim beside it.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  columnBuildDepthM,
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
  DesignSchema,
  KITCHEN_L_DESIGN,
  type Column,
  type Design,
  type EmptyColumn,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { columnKeyAt } from "../support/wall-b-column-keys";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `A|0.30`: a wall run over nothing but the undeletable corner base. Cleared it is the member-less
 *  **wall** column the ratchet bit — the one published depth this wave moves. */
const WALL_KEY = "A|0.30";
const WALL_MEMBERS = ["p8", "p15"];

/** `A|2.00`: the dishwasher niche. Cleared it is a member-less **base** column frozen at 620, a
 *  depth `columnBuildDepthM` cannot express at either setting — the surplus. */
const BASE_KEY = "A|2.00";
const BASE_MEMBERS = ["p1", "p12", "p18"];

/** `A|1.30`: the sink run, and the only column on either wall wide enough to take a full-height body
 *  whose `widthFlex: "fit"` then spans **past its own column** into `A|2.00`'s. */
const SINK_KEY = "A|1.30";
const SINK_MEMBERS = ["p0", "p11", "p17"];

const FRIDGE_MEMBERS = ["p7", "p24"];

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function columnOf(store: Store, key: string): Column {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

function depthMmOf(store: Store, key: string): number {
  return columnOf(store, key).d * 1000;
}

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
    `setCabinetDepth ${String(cabinetDepthMm)}`,
  ).toBeNull();
  return store;
}

function reload(store: Store): Store {
  return createStore(
    DesignSchema.parse(JSON.parse(JSON.stringify(store.getState().design))),
  );
}

const stripSource = (entry: EmptyColumn): EmptyColumn => {
  const stripped = { ...entry };
  delete stripped.depthFromBuildId;
  return stripped;
};

/** The held design re-read as a **pre-6K-c** document: every `depthFromBuildId` removed, and each
 *  remaining entry optionally rewritten. Both frozen arrays, because a column with members and one
 *  without are the same fact under two keys (ADR 0053). */
function asLegacyDocument(
  store: Store,
  rewrite: (entry: EmptyColumn) => EmptyColumn = (entry) => entry,
): Store {
  const held = store.getState().design;
  const asStored = (entry: EmptyColumn) => rewrite(stripSource(entry));
  return createStore(
    DesignSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...held,
          emptyColumns: (held.emptyColumns ?? []).map(asStored),
          columnExtents: (held.columnExtents ?? []).map(asStored),
        }),
      ),
    ),
  );
}

/** The build ceiling this rule answers with — 330/400 with nothing full-height under the opening,
 *  600/700 with one — in the millimetres the assertions are written in. */
function ceilingMm(
  cabinetDepthMm: number,
  hasFullHeightUnder: boolean,
): number {
  return columnBuildDepthM({ cabinetDepthMm, hasFullHeightUnder }) * 1000;
}

/** **ADR 0073 decision 3 as wave 6K-c shipped it**, as a reference model: the deeper-only MAX with
 *  no freeze-time question at all. Every assertion that says "this wave keeps less than 6K-c would"
 *  is measured against this and not against a remembered number. */
function sixKcFallbackMm(frozenMm: number, newCeilingMm: number): number {
  return Math.max(frozenMm, newCeilingMm);
}

// =================================================================================================
// The boundary the wave chose, and the epsilon it chose it with.
// =================================================================================================

describe("the surplus predicate's own boundary", () => {
  /** A member-less legacy wall column at one stored depth, at one stored setting. `A|0.30` is the
   *  only column on either wall that can be emptied and left with no full-height member near it, so
   *  it is the clean `hasFullHeightUnder: false` probe. */
  function wallColumnFrozenAt(depthMm: number, settingMm: number): Store {
    const cleared = removeAll(createStore(), WALL_MEMBERS);
    if (settingMm !== DEFAULT_CABINET_DEPTH_MM) setDepth(cleared, settingMm);
    return asLegacyDocument(cleared, (entry) =>
      entry.wall === "A" && entry.alongMm === 300
        ? { ...entry, depthMm }
        : entry,
    );
  }

  // **Both arms, swept a millimetre at a time.** Re-authored to the corrected boundary
  // ([ADR 0080](../../../../docs/decisions/0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md)
  // amendment C): the rule is `|column.d − atFreezeM| <= EPSILON`, an **equality**, so only a depth
  // sitting exactly on the ceiling of the setting being left follows the setting. The assertion this
  // replaces read `frozenMm <= atFreezeMm`, which characterised the `<=` this file's own F1 example
  // falsified — a raised ceiling swallowing a legacy 620 that no version of this rule ever published.
  //
  // The claim is *stronger*, not weaker: everything strictly below the freeze-time ceiling used to be
  // asserted as following the setting and is now asserted as a surplus, and the two answers differ
  // wherever `newM < frozenMm < atFreezeMm`. Swept rather than sampled, because a discrete `it.each`
  // of 330/400 would pass against `>=`, against `>`, and against a predicate reading the *new*
  // ceiling instead of the one being left.
  propertyTest.prop([
    fc.integer({ min: 200, max: 900 }),
    fc.constantFrom(...declaredCabinetDepthsMm()),
    fc.constantFrom(...declaredCabinetDepthsMm()),
  ])(
    "answers with the new ceiling only on the ceiling it is leaving, and holds everything else",
    (frozenMm, fromMm, toMm) => {
      const store = wallColumnFrozenAt(frozenMm, fromMm);
      const { hasFullHeightUnder } = columnOf(store, WALL_KEY);
      expect(hasFullHeightUnder).toBe(false);
      const atFreezeMm = ceilingMm(fromMm, hasFullHeightUnder);
      const newMm = ceilingMm(toMm, hasFullHeightUnder);

      setDepth(store, toMm);

      const publishedMm = depthMmOf(store, WALL_KEY);
      if (frozenMm === atFreezeMm) {
        // The rule's own previous answer: it follows the setting exactly, in both directions.
        expect(publishedMm).toBeCloseTo(newMm, 6);
      } else {
        // Anything else is a surplus this rule cannot claim to have written: deeper-only, ADR 0073
        // decision 3 unchanged. Below the new ceiling that MAX returns the new ceiling anyway, which
        // is why the two forms agree there and differ only in `(newM, atFreezeM)`.
        expect(publishedMm).toBeCloseTo(sixKcFallbackMm(frozenMm, newMm), 6);
      }
    },
  );

  // The transition itself, named at the millimetre so a regression reads as a number and not as a
  // property failure. Leaving 700, the ceiling is 400: one millimetre either side of it is a surplus,
  // and only 400 follows the setting down to 330. The 399 row is what the `<=` rule got wrong — it
  // published 330 there too, and a 399 is not a depth this rule ever wrote.
  it("switches arms on the ceiling it is leaving and one millimetre either side of it", () => {
    const atThreeNinetyNine = wallColumnFrozenAt(399, DEEPER_MM);
    const atFourHundred = wallColumnFrozenAt(400, DEEPER_MM);
    const atFourHundredOne = wallColumnFrozenAt(401, DEEPER_MM);

    setDepth(atThreeNinetyNine, DEFAULT_CABINET_DEPTH_MM);
    setDepth(atFourHundred, DEFAULT_CABINET_DEPTH_MM);
    setDepth(atFourHundredOne, DEFAULT_CABINET_DEPTH_MM);

    expect(depthMmOf(atThreeNinetyNine, WALL_KEY)).toBeCloseTo(399, 6);
    expect(depthMmOf(atFourHundred, WALL_KEY)).toBeCloseTo(330, 6);
    expect(depthMmOf(atFourHundredOne, WALL_KEY)).toBeCloseTo(401, 6);
  });

  // **Whether any reachable document lands inside the band.** `FROZEN_SURPLUS_EPSILON_M` is 1e-9 m
  // and every stored depth is a whole millimetre (`EmptyColumnSchema.depthMm` is `z.int()`), so a
  // stored depth is either exactly on a ceiling or a full millimetre — six orders of magnitude —
  // away from it. The band therefore changes no stored document's answer, and its only effect is on
  // an in-session float, which is the reason it was chosen over a bare `<=`.
  propertyTest.prop([
    fc.integer({ min: 1, max: 2000 }),
    fc.constantFrom(...declaredCabinetDepthsMm()),
    fc.boolean(),
  ])(
    "leaves no whole-millimetre depth strictly inside the float band",
    (depthMm, cabinetDepthMm, hasFullHeightUnder) => {
      const gapM =
        Math.abs(depthMm - ceilingMm(cabinetDepthMm, hasFullHeightUnder)) /
        1000;

      expect(gapM === 0 || gapM > 1e-9).toBe(true);
    },
  );

  // …and the in-session half of the same argument: a column this arm answered holds the ceiling
  // **to the bit**, so the next call's subtraction is exactly zero rather than an epsilon away from
  // it. Asserted with `toBe` deliberately — `toBeCloseTo` is what would hide a drift here.
  it("publishes the ceiling bit-for-bit, so the next call subtracts to exactly zero", () => {
    const store = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));

    setDepth(store, DEEPER_MM);

    const { d, hasFullHeightUnder } = columnOf(store, WALL_KEY);
    expect(d).toBe(
      columnBuildDepthM({ cabinetDepthMm: DEEPER_MM, hasFullHeightUnder }),
    );
  });
});

// =================================================================================================
// `hasFullHeightUnder`: the live predicate feeds both ceilings, and it is asked in both directions.
// =================================================================================================

describe("hasFullHeightUnder feeds both ceilings, and the asymmetry runs both ways", () => {
  /** A `tall-pantry` inserted into the cleared sink run `A|1.30`, which is 800 mm wide: the pantry fills it,
   *  [900, 1700], and only ABUTS the 600 mm dishwasher slot `A|2.00`, [1700, 2300]. */
  function withAPantryStandingOverTheDishwasherSlot(): Store {
    const store = removeAll(createStore(), [...SINK_MEMBERS, ...BASE_MEMBERS]);
    const opening = store
      .getState()
      .voids.find((record) => record.id.startsWith(`${SINK_KEY}:`));
    if (!opening) throw new Error("no opening in the cleared sink run");
    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert("tall-pantry");
    expect(store.getState().lastRejection, "insert tall-pantry").toBeNull();
    return store;
  }

  // **The population pin** (ADR 0123). The two tests that used to follow this one drove a member-less column whose
  // predicate is TRUE through a depth change, by this very fixture. Under the corrected overlap the state is not
  // reachable here — the pantry's span [900, 1700] meets the slot's [1700, 2300] at a point — so those cases are
  // declared witnesses in the domain package (`frozen-map-declared-witnesses.test.ts`) and this pins the
  // population as empty. It goes red if a later change makes the state reachable again, and the scenario tests
  // then come back.
  it("leaves the member-less dishwasher slot beside an inserted pantry reading false, the spans abutting", () => {
    const store = withAPantryStandingOverTheDishwasherSlot();
    const pantry = store
      .getState()
      .design.placements.find(
        (placement) => placement.body.buildId === "tall-pantry",
      );
    const slot = columnOf(store, BASE_KEY);

    expect(pantry && pantry.alongMm - pantry.body.widthMm / 2).toBe(900);
    expect(pantry && pantry.alongMm + pantry.body.widthMm / 2).toBe(1700);
    expect(slot.x * 1000 - (slot.w * 1000) / 2).toBeCloseTo(1700, 6);
    expect(slot.x * 1000 + (slot.w * 1000) / 2).toBeCloseTo(2300, 6);
    expect(slot.hasFullHeightUnder).toBe(false);
    expect(depthMmOf(store, BASE_KEY)).toBeCloseTo(620, 6);
    expect(
      store.getState().records.some((record) => record.col === BASE_KEY),
      "the dishwasher slot is still member-less",
    ).toBe(false);
  });

  // **The direction the wave names.** A deleted full-height member lowers the freeze-time ceiling,
  // so a frozen depth that sat on it becomes a surplus and is kept. Confirmed.
  it("keeps more when the full-height member is gone", () => {
    const store = asLegacyDocument(removeAll(createStore(), ["p6", "p23"]));
    const cleared = columnOf(store, "B|1.80");
    expect(cleared.hasFullHeightUnder).toBe(false);

    setDepth(store, DEEPER_MM);

    // 600 is on the ceiling a live `true` would have given, and above the `false` one — so the
    // live answer is what makes it a surplus and keeps it.
    expect(ceilingMm(DEFAULT_CABINET_DEPTH_MM, true)).toBeCloseTo(600, 6);
    expect(ceilingMm(DEFAULT_CABINET_DEPTH_MM, false)).toBeLessThan(600);
    // ADR 0090 decision 2: the depth does not move and the wall-B coordinate does — a deeper corner
    // on wall A takes more of wall B. Only the anchor is setting-dependent.
    expect(depthMmOf(store, columnKeyAt("B|1.80", DEEPER_MM))).toBeCloseTo(
      600,
      6,
    );
  });

  // **The control for the declared witnesses.** ADR 0080 decision 4 makes `hasFullHeightUnder` the live
  // predicate, and says it can only ever make this rule keep more. The case that would test it, a full-height
  // member over a member-less legacy slot, is not reached by inserting a pantry beside the slot: the pantry
  // fills [900, 1700], the slot is [1700, 2300], the two abut, and the predicate reads false. That state is
  // held by the declared witnesses in `packages/configurator-domain/tests/frozen-map-declared-witnesses.test.ts`
  // (ADR 0123).
  //
  // Here the same legacy 620 with nothing full-height over it keeps at both settings: the predicate is false,
  // so the freeze-time ceiling is 400 and 620 is a surplus.
  it("keeps a legacy 620 at both settings when nothing full-height stands over it", () => {
    const atSevenHundred = setDepth(
      removeAll(createStore(), [...SINK_MEMBERS, ...BASE_MEMBERS]),
      DEEPER_MM,
    );
    const legacy = asLegacyDocument(atSevenHundred, (entry) =>
      entry.wall === "A" && entry.alongMm === 2000
        ? { ...entry, depthMm: 620 }
        : entry,
    );
    expect(columnOf(legacy, BASE_KEY).hasFullHeightUnder).toBe(false);

    setDepth(legacy, DEFAULT_CABINET_DEPTH_MM);

    expect(depthMmOf(legacy, BASE_KEY)).toBeCloseTo(620, 6);
  });
});

// =================================================================================================
// A ratchet the previous rule already wrote into a stored document.
// =================================================================================================

describe("a ratchet already written into a document", () => {
  /** Wave 6K-a's own output, which is what the legacy population holds: a member-less wall column
   *  deepened to 400 at 700 and then **saved while the kitchen was back at 600**, because the
   *  deeper-only MAX held it there. ADR 0080's measurement table records exactly this row. */
  function documentCarryingTheOldRatchet(): Store {
    return asLegacyDocument(removeAll(createStore(), WALL_MEMBERS), (entry) =>
      entry.wall === "A" && entry.alongMm === 300
        ? { ...entry, depthMm: 400 }
        : entry,
    );
  }

  // **The wave ends the ratchet as a transition and does not clear it from the documents the old
  // rule already wrote.** At 600 an unsourced 400 is deeper than `columnBuildDepthM(600, false)`, so
  // the surplus arm keeps it — which is ADR 0080 decision 4's own sentence (*"a document at 600
  // carrying an unsourced 400 and a document at 700 carrying an unsourced 400 are two different
  // documents"*) and is therefore the declared behaviour rather than a defect. It is asserted here
  // because no criterion of the wave states it: the owner's 70 mm-proud wall opening survives the
  // load, and survives every command that is not a depth change.
  it("still publishes 400 in a 600 mm kitchen on load", () => {
    const store = documentCarryingTheOldRatchet();

    expect(depthMmOf(store, WALL_KEY)).toBeCloseTo(400, 6);
    expect(ceilingMm(DEFAULT_CABINET_DEPTH_MM, false)).toBeCloseTo(330, 6);
    // And a reload does not move it either: the document answers the same way twice.
    expect(depthMmOf(reload(store), WALL_KEY)).toBeCloseTo(400, 6);
  });

  // It takes a **whole round trip** to clear, which is the shape of the residue the wave leaves.
  it("needs a 600 to 700 to 600 round trip before it follows the setting", () => {
    const store = documentCarryingTheOldRatchet();

    setDepth(store, DEEPER_MM);
    const atSevenHundredMm = depthMmOf(store, WALL_KEY);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(atSevenHundredMm).toBeCloseTo(400, 6);
    expect(depthMmOf(store, WALL_KEY)).toBeCloseTo(330, 6);
  });
});

// =================================================================================================
// Round trips longer than two.
// =================================================================================================

describe("over round trips longer than two", () => {
  const LEGACY_SCENARIOS: readonly (readonly [string, () => Store])[] = [
    [
      "a cleared wall column",
      () => asLegacyDocument(removeAll(createStore(), WALL_MEMBERS)),
    ],
    [
      "a cleared base slot",
      () => asLegacyDocument(removeAll(createStore(), BASE_MEMBERS)),
    ],
    [
      "a cleared appliance niche",
      () => asLegacyDocument(removeAll(createStore(), FRIDGE_MEMBERS)),
    ],
    [
      "a cleared oven tower",
      () => asLegacyDocument(removeAll(createStore(), ["p5", "p22"])),
    ],
    [
      "a cleared pantry",
      () => asLegacyDocument(removeAll(createStore(), ["p6", "p23"])),
    ],
  ];

  function publishedMillimetres(store: Store): Record<string, number> {
    return Object.fromEntries(
      [...store.getState().columns].map(([key, column]) => [
        key,
        Math.round(column.d * 1e6) / 1000,
      ]),
    );
  }

  // **ADR 0073's consequence says a round trip does not return; this establishes what it does
  // instead.** After the first depth change the whole published map is a function of the setting
  // alone — so the sequence collapses to a two-cycle and nothing accumulates, whatever order the
  // settings arrive in. Swept over sequences rather than the one 700 → 600 leg, because a rule that
  // drifted by a millimetre per leg would pass any two-step test.
  propertyTest.prop([
    fc.array(fc.constantFrom(...declaredCabinetDepthsMm()), {
      minLength: 3,
      maxLength: 9,
    }),
  ])("converges to a two-cycle keyed only on the setting", (sequence) => {
    for (const [name, open] of LEGACY_SCENARIOS) {
      const store = open();
      setDepth(store, sequence[0] ?? DEEPER_MM);
      const bySetting = new Map<number, Record<string, number>>();
      for (const cabinetDepthMm of sequence) {
        setDepth(store, cabinetDepthMm);
        const seen = bySetting.get(cabinetDepthMm);
        const now = publishedMillimetres(store);
        if (seen)
          expect(now, `${name} at ${String(cabinetDepthMm)}`).toStrictEqual(
            seen,
          );
        else bySetting.set(cabinetDepthMm, now);
      }
    }
  });

  // The two fixed points the cycle is made of, named so a regression is legible: the fallback's own
  // answer alternates with the setting, and the surplus does not move at all.
  it("alternates the wall column and pins the base slot over four legs", () => {
    const wall = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));
    const base = asLegacyDocument(removeAll(createStore(), BASE_MEMBERS));
    const wallTrail: number[] = [];
    const baseTrail: number[] = [];

    for (const cabinetDepthMm of [
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
      DEEPER_MM,
      DEFAULT_CABINET_DEPTH_MM,
    ]) {
      setDepth(wall, cabinetDepthMm);
      setDepth(base, cabinetDepthMm);
      wallTrail.push(Math.round(depthMmOf(wall, WALL_KEY)));
      baseTrail.push(Math.round(depthMmOf(base, BASE_KEY)));
    }

    expect(wallTrail).toStrictEqual([400, 330, 400, 330]);
    expect(baseTrail).toStrictEqual([620, 620, 620, 620]);
  });
});

// =================================================================================================
// A fallback depth buried under an intervening command.
// =================================================================================================

describe("a depth the fallback produced, then buried", () => {
  /** The wall opening the fallback deepened, refilled and emptied again. This is the state-versus-
   *  transition shape: `column.d` has been rewritten by a command that is not a depth change between
   *  the two settings, so the predicate must still classify it from the document it is handed. */
  it("re-sources a fallback depth through an insert and a delete, and follows the setting after", () => {
    const store = asLegacyDocument(removeAll(createStore(), WALL_MEMBERS));
    setDepth(store, DEEPER_MM);
    expect(depthMmOf(store, WALL_KEY)).toBeCloseTo(400, 6);
    expect(columnOf(store, WALL_KEY).depthFromBuildId).toBeUndefined();

    const opening = store
      .getState()
      .voids.find((record) => record.id.startsWith(`${WALL_KEY}:`));
    if (!opening) throw new Error("no opening in the cleared wall run");
    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert("wall-cabinet");
    expect(store.getState().lastRejection, "insert wall-cabinet").toBeNull();
    const inserted = store
      .getState()
      .records.find((record) => record.col === WALL_KEY);
    if (!inserted) throw new Error("nothing was inserted into the wall run");
    removeAll(store, [inserted.id]);

    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    // The insert re-sourced the column, so the sourced arm — not the fallback — answers now, and it
    // answers with the wall map's own row rather than with the 400 the fallback left behind.
    expect(depthMmOf(store, WALL_KEY)).toBeCloseTo(330, 6);
  });

  // The surplus half of the same shape: refilling and re-emptying a legacy base slot must not turn
  // its 620 into something the fallback can claim.
  it("keeps a legacy base slot's surplus through an insert and a delete", () => {
    const store = asLegacyDocument(removeAll(createStore(), BASE_MEMBERS));
    const opening = store
      .getState()
      .voids.find((record) => record.id.startsWith(`${BASE_KEY}:`));
    if (!opening) throw new Error("no opening in the cleared base slot");
    store.getState().select({ kind: "void", id: opening.id });
    store.getState().insert("base-cabinet");
    expect(store.getState().lastRejection, "insert base-cabinet").toBeNull();
    const inserted = store
      .getState()
      .records.find((record) => record.col === BASE_KEY);
    if (!inserted) throw new Error("nothing was inserted into the base slot");
    removeAll(store, [inserted.id]);

    setDepth(store, DEEPER_MM);
    const deepenedMm = depthMmOf(store, BASE_KEY);
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    // Never the wall map's 330 or 400, at either setting — the criterion's own words.
    expect(deepenedMm).toBeGreaterThan(ceilingMm(DEEPER_MM, false));
    expect(depthMmOf(store, BASE_KEY)).toBeGreaterThan(
      ceilingMm(DEFAULT_CABINET_DEPTH_MM, false),
    );
  });
});

// =================================================================================================
// Merged, split and clipped legacy extents.
// =================================================================================================

describe("merged and split legacy extents", () => {
  // Three member-less legacy columns at once, two of them the fallback's own answer and one a
  // surplus, sharing a wall and overlapping each other's spans. Each must be classified on its own
  // depth: the merge takes the leftmost-shallowest member's whole column (ADR 0079 decision 7), so a
  // shape that classified the run rather than the column would answer 330 for the 620 slot.
  it("classifies each piece of a cleared run on its own depth", () => {
    const store = asLegacyDocument(
      removeAll(createStore(), [
        ...WALL_MEMBERS,
        "p10",
        "p16",
        ...SINK_MEMBERS,
      ]),
    );
    const before = {
      wall: depthMmOf(store, WALL_KEY),
      neighbour: depthMmOf(store, "A|0.75"),
      sink: depthMmOf(store, SINK_KEY),
    };

    setDepth(store, DEEPER_MM);
    const deepened = {
      wall: depthMmOf(store, WALL_KEY),
      neighbour: depthMmOf(store, "A|0.75"),
      sink: depthMmOf(store, SINK_KEY),
    };
    setDepth(store, DEFAULT_CABINET_DEPTH_MM);

    expect(before).toStrictEqual({ wall: 330, neighbour: 330, sink: 620 });
    expect(deepened).toStrictEqual({ wall: 400, neighbour: 400, sink: 620 });
    expect({
      wall: depthMmOf(store, WALL_KEY),
      neighbour: depthMmOf(store, "A|0.75"),
      sink: depthMmOf(store, SINK_KEY),
    }).toStrictEqual({ wall: 330, neighbour: 330, sink: 620 });
  });
});

// =================================================================================================
// One document, one answer, whatever route reached it.
// =================================================================================================

describe("one document answers one way, whatever route reached it", () => {
  function inMillimetres(store: Store): Record<string, number> {
    return Object.fromEntries(
      [...store.getState().columns].map(([key, column]) => [
        key,
        Math.round(column.d * 1000),
      ]),
    );
  }

  // ADR 0011's 2026-08-26 correction. The implementer drove one scenario by three routes; this
  // drives four scenarios by five, including routes that go through the wire in the middle, and
  // compares the whole map rather than one key.
  it("publishes one map for five routes, on every legacy scenario", () => {
    const scenarios: readonly (readonly [string, readonly string[]])[] = [
      ["a cleared wall column", WALL_MEMBERS],
      ["a cleared base slot", BASE_MEMBERS],
      ["a cleared appliance niche", FRIDGE_MEMBERS],
      ["a cleared pantry", ["p6", "p23"]],
    ];

    for (const [name, members] of scenarios) {
      const open = () => asLegacyDocument(removeAll(createStore(), members));
      const routes: Record<string, Store> = {
        "one leg": setDepth(
          setDepth(open(), DEEPER_MM),
          DEFAULT_CABINET_DEPTH_MM,
        ),
        "three legs": setDepth(
          setDepth(
            setDepth(setDepth(open(), DEEPER_MM), DEFAULT_CABINET_DEPTH_MM),
            DEEPER_MM,
          ),
          DEFAULT_CABINET_DEPTH_MM,
        ),
        "reloaded midway": setDepth(
          reload(setDepth(open(), DEEPER_MM)),
          DEFAULT_CABINET_DEPTH_MM,
        ),
        "reloaded at every step": setDepth(
          reload(setDepth(reload(open()), DEEPER_MM)),
          DEFAULT_CABINET_DEPTH_MM,
        ),
        "settled first at 600": setDepth(
          setDepth(setDepth(open(), DEFAULT_CABINET_DEPTH_MM), DEEPER_MM),
          DEFAULT_CABINET_DEPTH_MM,
        ),
      };

      const [reference, ...rest] = Object.entries(routes);
      if (!reference) throw new Error("no routes");
      for (const [label, store] of rest) {
        expect(inMillimetres(store), `${name} by ${label}`).toStrictEqual(
          inMillimetres(reference[1]),
        );
      }
    }
  });
});
