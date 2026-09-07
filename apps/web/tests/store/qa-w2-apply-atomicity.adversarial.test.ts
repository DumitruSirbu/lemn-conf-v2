// **Adversarial QA for wave W2, attack 3: atomicity has to be real, not merely ordered.**
//
// `tests/store/whole-kitchen-apply.test.ts` drives one refusal — the **last** command's, reached by
// withholding the body probe. That is the audit's own case and it holds, but it is also the easiest
// one: a chain that stops at its final link never has to prove it can discard the links before it.
//
// So this file attacks the claim from the other sides.
//
//   - A refusal in the **middle** (`hardware`), and in the **first** (`material`), each with the
//     later commands able to succeed. The claim *nothing commits unless everything commits* is only
//     tested where an earlier command has already produced a design.
//   - **The preflight writes nothing**, proved on the object it is handed rather than by reading its
//     source: side-effect freedom is what makes commit-or-nothing possible without a rollback.
//   - **The preflight predicts the commit**, over every subset of the three settings and both probe
//     states — the assumption a "preflight then commit" split rests on and that no test states.
//   - **The order is load-bearing**, so the chained press must land the store in the same place the
//     three separate actions did. That is `whole-kitchen-apply.ts`'s own justification for material →
//     hardware → depth (`applyCommandResult` reads the column map off the last effect) and it is
//     asserted here against the three actions themselves rather than against a description of them.
//   - Two presses racing, and a press arriving on a `lastRejection` an unrelated act left standing.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  declaredCabinetDepthsMm,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";
import {
  preflightWholeKitchenSettings,
  type WholeKitchenSettingsRequest,
} from "@/store/whole-kitchen-apply";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

/** Read off the book rather than written, so a re-ordered book cannot make one of these a no-op. */
const ANOTHER_MATERIAL = MATERIAL_TIER_IDS.at(-1) ?? "";
const ANOTHER_HARDWARE = HARDWARE_TIER_IDS.at(-1) ?? "";
const ANOTHER_DEPTH_MM =
  declaredCabinetDepthsMm().find(
    (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
  ) ?? 0;

/** An id no book offers. `setMaterialTier` and `setHardwareTier` both refuse an id their caller did
 *  not list, which is the one refusal a tier command has — and the only way to make a command
 *  *other than the last* refuse. */
const UNOFFERED_TIER_ID = "tier.the-book-never-offered";

/** Pinned, so two routes to the same document serialise identically instead of differing by the
 *  number of times the store read a clock. */
const FIXED_CLOCK = "2026-09-07T00:00:00.000Z";

interface StoreOptions {
  readonly hasProbe: boolean;
}

function storeFor(options: StoreOptions) {
  const saved: Design[] = [];
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => FIXED_CLOCK,
    ...(options.hasProbe ? { probeAt: createFakeProbeFactory() } : {}),
    onDesignChanged: (design) => saved.push(design),
  });
  return { store, saved };
}

/** The three fields a press may carry, named so a sweep can build subsets of them without the
 *  compiler losing track of what it is spreading. */
type ChosenSettings = Partial<
  Pick<
    WholeKitchenSettingsRequest,
    "materialTierId" | "hardwareTierId" | "cabinetDepthMm"
  >
>;

/** One object less one key. Written out rather than destructured, because a discarded binding is an
 *  unused variable and this suite's lint has no exemption for one. */
function withoutKey(value: object, dropped: string): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== dropped),
  );
}

function requestOf(chosen: ChosenSettings): WholeKitchenSettingsRequest {
  return {
    ...(chosen.materialTierId === undefined
      ? {}
      : { materialTierId: chosen.materialTierId }),
    ...(chosen.hardwareTierId === undefined
      ? {}
      : { hardwareTierId: chosen.hardwareTierId }),
    ...(chosen.cabinetDepthMm === undefined
      ? {}
      : { cabinetDepthMm: chosen.cabinetDepthMm }),
    availableMaterialTierIds: [...MATERIAL_TIER_IDS, UNOFFERED_TIER_ID].filter(
      (tierId) => tierId !== UNOFFERED_TIER_ID,
    ),
    availableHardwareTierIds: HARDWARE_TIER_IDS,
  };
}

/** Key order is not state. Two routes to one answer build their objects in the order their own code
 *  assigns fields, and `JSON.stringify` would report that as a difference — so every comparison here
 *  goes through a serialiser that sorts. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, one]) => `${JSON.stringify(key)}:${canonicalJson(one)}`)
    .join(",")}}`;
}

function sortedEntriesOf(columns: ReadonlyMap<string, Column>): unknown {
  return [...columns.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

/** The store's whole observable geometry, so "nothing committed" is asserted over what the scene
 *  and the offers are drawn from rather than over `design` alone. */
function snapshotOf(store: ReturnType<typeof storeFor>["store"]): string {
  const state = store.getState();
  return canonicalJson({
    design: canonicalSerializeDesign(state.design),
    records: state.records,
    columns: sortedEntriesOf(state.columns),
    recordedColumns: sortedEntriesOf(state.recordedColumns),
    voids: state.voids,
    selection: state.selection,
  });
}

/**
 * The same snapshot with each column's `regions` dropped, which is what the two routes to one press
 * are compared on. **The exclusion is measured, not assumed** — see the test that pins it.
 *
 * `regions` is the one field of the in-memory map the chained press and the three separate actions
 * disagree about, and only on a design that carries no `columnExtents` yet: the three actions
 * reprojected the document after each tier command, so the depth command read reconstructed
 * single-band extents, where the chain hands it the design the tier command returned. It is not
 * persisted — `canonicalSerializeDesign` carries the extents and not the bands — and every reader
 * asserted here agrees across the two routes.
 */
function snapshotWithoutRegionsOf(
  store: ReturnType<typeof storeFor>["store"],
): string {
  const state = store.getState();
  const withoutRegions = (columns: ReadonlyMap<string, Column>) =>
    [...columns.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, column]) => [key, withoutKey(column, "regions")]);
  return canonicalJson({
    design: canonicalSerializeDesign(state.design),
    records: state.records,
    columns: withoutRegions(state.columns),
    recordedColumns: withoutRegions(state.recordedColumns),
    voids: state.voids,
    selection: state.selection,
  });
}

describe("a press whose middle command refuses", () => {
  it("commits nothing, although the material before it and the depth after it both could have", () => {
    // The case the wave's own suite never reaches: the chain has already produced a design when the
    // refusal arrives, so this is where a rollback would be needed if there were anything to roll
    // back. The probe is attached, so the depth is not what refuses.
    const { store, saved } = storeFor({ hasProbe: true });
    const before = snapshotOf(store);

    const outcome = store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        hardwareTierId: UNOFFERED_TIER_ID,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
    );

    if (outcome.committed)
      throw new Error("expected the hardware half to refuse");
    expect(outcome.setting).toBe("hardware");
    expect(outcome.reason.code).toBe("UNKNOWN_HARDWARE_TIER");
    expect(snapshotOf(store)).toBe(before);
    expect(saved).toEqual([]);
  });

  it("is a case whose neighbours would each have committed on their own", () => {
    // Without this the assertion above is vacuous. The identical press with an offered hardware id
    // commits all three, so the refusal is what stopped it and not the fixture.
    const { store, saved } = storeFor({ hasProbe: true });

    const outcome = store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        hardwareTierId: ANOTHER_HARDWARE,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
    );

    expect(outcome.committed).toBe(true);
    expect(store.getState().design.settings?.materialTierId).toBe(
      ANOTHER_MATERIAL,
    );
    expect(store.getState().design.settings?.hardwareTierId).toBe(
      ANOTHER_HARDWARE,
    );
    expect(cabinetDepthMmOf(store.getState().design)).toBe(ANOTHER_DEPTH_MM);
    expect(saved.length).toBe(1);
  });
});

describe("a press whose first command refuses", () => {
  it("names the material and never reaches the two settings behind it", () => {
    const { store, saved } = storeFor({ hasProbe: true });
    const before = snapshotOf(store);

    const outcome = store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: UNOFFERED_TIER_ID,
        hardwareTierId: ANOTHER_HARDWARE,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
    );

    if (outcome.committed)
      throw new Error("expected the material half to refuse");
    expect(outcome.setting).toBe("material");
    expect(outcome.reason.code).toBe("UNKNOWN_MATERIAL_TIER");
    expect(snapshotOf(store)).toBe(before);
    expect(saved).toEqual([]);
  });

  it("reports the first refusal rather than the last, when two settings would both refuse", () => {
    // A press can carry more than one bad setting: an unoffered material and, with no probe, a
    // depth that cannot rebuild. The sheet names one control, so which one is a decision — and
    // stopping at the first is what makes the chain's order the order the customer reads.
    const { store } = storeFor({ hasProbe: false });

    const outcome = store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: UNOFFERED_TIER_ID,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
    );

    if (outcome.committed) throw new Error("expected a refusal");
    expect(outcome.setting).toBe("material");
  });
});

describe("the preflight itself", () => {
  /** The design the preflight is handed, kept out of any store so the only thing that could write
   *  to it is the preflight. */
  function preflightAgainst(
    request: WholeKitchenSettingsRequest,
    probe: boolean,
  ) {
    const design = KITCHEN_L_DESIGN;
    const before = canonicalSerializeDesign(design);
    const preflight = preflightWholeKitchenSettings(request, {
      design,
      catalogAt: buildKitchenLBodyCatalog,
      ...(probe
        ? { probeAt: createFakeProbeFactory() }
        : { probeAt: undefined }),
      occurredAt: FIXED_CLOCK,
    });
    return { preflight, design, before };
  }

  it("leaves the design it was handed untouched, on the path that succeeds", () => {
    // Commit-or-nothing has no rollback because nothing is held until the whole chain has run. That
    // rests entirely on the domain's commands being pure over the design they are given, which is
    // asserted here rather than assumed from their own suites.
    const { preflight, design, before } = preflightAgainst(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        hardwareTierId: ANOTHER_HARDWARE,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
      true,
    );

    expect(preflight.outcome).toBe("ready");
    expect(canonicalSerializeDesign(design)).toBe(before);
    if (preflight.outcome !== "ready") throw new Error("expected ready");
    // And the answer is a new document rather than the one it was handed, mutated.
    expect(preflight.result.design).not.toBe(design);
  });

  it("leaves the design it was handed untouched, on the path that refuses mid-chain", () => {
    const { preflight, design, before } = preflightAgainst(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        hardwareTierId: UNOFFERED_TIER_ID,
      }),
      true,
    );

    expect(preflight.outcome).toBe("refused");
    expect(canonicalSerializeDesign(design)).toBe(before);
  });

  it("predicts the commit at every subset of the three settings, on both probe states", () => {
    // The split this whole module rests on: what the preflight answers is what the store then does.
    // A preflight that said "ready" and a commit that refused, or the reverse, would put the store
    // back in the half-applied state the wave exists to remove.
    const chosen: readonly ChosenSettings[] = [
      { materialTierId: ANOTHER_MATERIAL },
      { hardwareTierId: ANOTHER_HARDWARE },
      { cabinetDepthMm: ANOTHER_DEPTH_MM },
    ];
    let sweptCases = 0;
    for (const hasProbe of [true, false])
      for (let mask = 0; mask < 1 << chosen.length; mask += 1) {
        const request = requestOf(
          chosen
            .filter((_one, index) => (mask & (1 << index)) !== 0)
            .reduce<ChosenSettings>((asked, one) => ({ ...asked, ...one }), {}),
        );
        const { preflight } = preflightAgainst(request, hasProbe);
        const { store, saved } = storeFor({ hasProbe });
        const before = snapshotOf(store);

        const outcome = store.getState().applyWholeKitchenSettings(request);

        const label = `probe=${String(hasProbe)} mask=${String(mask)}`;
        expect(outcome.committed, label).toBe(preflight.outcome !== "refused");
        expect(snapshotOf(store) === before, label).toBe(
          preflight.outcome !== "ready",
        );
        expect(saved.length, label).toBe(preflight.outcome === "ready" ? 1 : 0);
        sweptCases += 1;
      }

    expect(sweptCases).toBe(2 * (1 << chosen.length));
  });
});

describe("the order the chain runs in", () => {
  it("lands the store exactly where the three separate actions did", () => {
    // `whole-kitchen-apply.ts` says the order is load-bearing because `applyCommandResult` reads the
    // column map off the **last** effect, and a depth change is the only one of the three that
    // publishes a map. This asserts that against the three actions rather than against that
    // sentence: same clock, same probe, same fixture, one press versus three.
    const chained = storeFor({ hasProbe: true });
    const sequential = storeFor({ hasProbe: true });

    chained.store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        hardwareTierId: ANOTHER_HARDWARE,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
    );
    sequential.store
      .getState()
      .setMaterialTier(ANOTHER_MATERIAL, MATERIAL_TIER_IDS);
    sequential.store
      .getState()
      .setHardwareTier(ANOTHER_HARDWARE, HARDWARE_TIER_IDS);
    sequential.store.getState().setCabinetDepth(ANOTHER_DEPTH_MM);

    expect(snapshotWithoutRegionsOf(chained.store)).toBe(
      snapshotWithoutRegionsOf(sequential.store),
    );
    // One press is one document, where three actions were three.
    expect(chained.saved.length).toBe(1);
    expect(sequential.saved.length).toBe(3);
  });

  it("differs from them only in a column band nothing stored or drawn is derived from", () => {
    // **The one measured difference between the two routes, characterised rather than hidden by the
    // exclusion above.** Three actions reprojected the document after each tier command, so the
    // depth command read `columnExtents` the store had just written and rebuilt each column as one
    // band; the chain hands it the design the hardware command returned, which on a fixture that has
    // never been through a command carries no `columnExtents` at all, so the bands stay the
    // member-shaped ones the placements imply.
    //
    // Nothing asserted above moves with it: the document, the records, the voids, the selection and
    // every column extent agree, and so do both routes' answers to a follow-up delete. It is pinned
    // because it is a real behaviour change the wave introduced and because the day it stops being
    // confined to this field, this line is what says so.
    const chained = storeFor({ hasProbe: true });
    const sequential = storeFor({ hasProbe: true });

    chained.store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      }),
    );
    sequential.store
      .getState()
      .setMaterialTier(ANOTHER_MATERIAL, MATERIAL_TIER_IDS);
    sequential.store.getState().setCabinetDepth(ANOTHER_DEPTH_MM);

    expect(snapshotOf(chained.store)).not.toBe(snapshotOf(sequential.store));
    expect(snapshotWithoutRegionsOf(chained.store)).toBe(
      snapshotWithoutRegionsOf(sequential.store),
    );
  });

  it("agrees with them on what a command after the press then does", () => {
    // The reason the band above is reported as confined rather than as a defect: if the two routes
    // left the store meaningfully different, the next command would say so.
    const chained = storeFor({ hasProbe: true });
    const sequential = storeFor({ hasProbe: true });
    const press = requestOf({
      materialTierId: ANOTHER_MATERIAL,
      hardwareTierId: ANOTHER_HARDWARE,
      cabinetDepthMm: ANOTHER_DEPTH_MM,
    });

    chained.store.getState().applyWholeKitchenSettings(press);
    sequential.store
      .getState()
      .setMaterialTier(ANOTHER_MATERIAL, MATERIAL_TIER_IDS);
    sequential.store
      .getState()
      .setHardwareTier(ANOTHER_HARDWARE, HARDWARE_TIER_IDS);
    sequential.store.getState().setCabinetDepth(ANOTHER_DEPTH_MM);

    const removedId = chained.store.getState().records.at(0)?.id;
    if (removedId === undefined) throw new Error("the fixture has no bodies");
    expect(sequential.store.getState().records.at(0)?.id).toBe(removedId);
    for (const one of [chained.store, sequential.store]) {
      one.getState().select({ kind: "placement", id: removedId });
      one.getState().remove();
    }

    expect(snapshotWithoutRegionsOf(chained.store)).toBe(
      snapshotWithoutRegionsOf(sequential.store),
    );
    expect(canonicalSerializeDesign(chained.store.getState().design)).toBe(
      canonicalSerializeDesign(sequential.store.getState().design),
    );
    expect(JSON.stringify(chained.store.getState().voids)).toBe(
      JSON.stringify(sequential.store.getState().voids),
    );
  });

  it("lands there too when the depth is the only setting the press moves", () => {
    // The arm where the last effect is the depth's and there is nothing before it, so a chain that
    // silently dropped its earlier links would still pass the case above.
    const chained = storeFor({ hasProbe: true });
    const sequential = storeFor({ hasProbe: true });

    chained.store
      .getState()
      .applyWholeKitchenSettings(
        requestOf({ cabinetDepthMm: ANOTHER_DEPTH_MM }),
      );
    sequential.store.getState().setCabinetDepth(ANOTHER_DEPTH_MM);

    expect(snapshotOf(chained.store)).toBe(snapshotOf(sequential.store));
  });

  it("lands there too when no depth is in the press, so the last effect publishes no map", () => {
    const chained = storeFor({ hasProbe: true });
    const sequential = storeFor({ hasProbe: true });

    chained.store.getState().applyWholeKitchenSettings(
      requestOf({
        materialTierId: ANOTHER_MATERIAL,
        hardwareTierId: ANOTHER_HARDWARE,
      }),
    );
    sequential.store
      .getState()
      .setMaterialTier(ANOTHER_MATERIAL, MATERIAL_TIER_IDS);
    sequential.store
      .getState()
      .setHardwareTier(ANOTHER_HARDWARE, HARDWARE_TIER_IDS);

    expect(snapshotOf(chained.store)).toBe(snapshotOf(sequential.store));
  });
});

describe("two presses of the same button", () => {
  it("writes one document, because the second asks for nothing the first did not already store", () => {
    // The double tap. The second press runs no command at all — every field it names is already
    // stored — so it neither writes nor schedules, and the design object is the first press's.
    const { store, saved } = storeFor({ hasProbe: true });
    const request = requestOf({
      materialTierId: ANOTHER_MATERIAL,
      hardwareTierId: ANOTHER_HARDWARE,
      cabinetDepthMm: ANOTHER_DEPTH_MM,
    });

    const first = store.getState().applyWholeKitchenSettings(request);
    const afterFirst = store.getState().design;
    const second = store.getState().applyWholeKitchenSettings(request);

    expect(first.committed).toBe(true);
    expect(second.committed).toBe(true);
    expect(store.getState().design).toBe(afterFirst);
    expect(saved.length).toBe(1);
  });
});

describe("a press arriving on a refusal an unrelated act left standing", () => {
  it("replaces the sentence with its own when it refuses, and still commits nothing", () => {
    const { store, saved } = storeFor({ hasProbe: true });
    store.getState().setWidth(Number.NaN);
    const standing = store.getState().lastRejection;
    expect(standing).not.toBeNull();
    const before = snapshotOf(store);

    const outcome = store
      .getState()
      .applyWholeKitchenSettings(
        requestOf({ materialTierId: UNOFFERED_TIER_ID }),
      );

    expect(outcome.committed).toBe(false);
    expect(store.getState().lastRejection?.code).toBe("UNKNOWN_MATERIAL_TIER");
    expect(snapshotOf(store)).toBe(before);
    expect(saved).toEqual([]);
  });

  it("leaves the standing sentence alone when it asks for nothing new, so an untouched sheet is silent", () => {
    // Characterised rather than corrected: an unchanged press runs no command, so nothing clears
    // `lastRejection` — the figure behind the sheet keeps saying *De la neschimbat*. A committing
    // press does clear it (`whole-kitchen-apply.test.ts`), and no decision says an untouched press
    // should. Pinned so a change to it is a decision rather than a side effect.
    const { store } = storeFor({ hasProbe: true });
    store.getState().setWidth(Number.NaN);
    const standing = store.getState().lastRejection;

    const outcome = store
      .getState()
      .applyWholeKitchenSettings(
        requestOf({ cabinetDepthMm: cabinetDepthMmOf(KITCHEN_L_DESIGN) }),
      );

    expect(outcome.committed).toBe(true);
    expect(store.getState().lastRejection).toBe(standing);
  });
});
