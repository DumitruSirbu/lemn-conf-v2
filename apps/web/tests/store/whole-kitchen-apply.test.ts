// **One press of *Aplică* is one commit, or it is nothing** (M6-AUD-004).
//
// The defect this closes was not that any one command was wrong. Each of `setMaterialTier`,
// `setHardwareTier` and `setCabinetDepth` behaved exactly as its own tests said; the failure was in
// the *press*, which ran all three as independent store actions and closed the sheet whatever came
// back. The audit's own words: nothing rolls back an earlier action when a later one refuses.
//
// So the assertions here are all about the combination, and the case that matters is the one no
// existing test drove: a **later** command refusing after an earlier one would have succeeded.
// `setCabinetDepth` refuses `BODY_PROBE_UNAVAILABLE` with no probe attached, which is a reachable
// state rather than a contrived one — the sheet offers every declared depth on the strength of the
// declared map alone, and says nothing about whether the scene has attached yet.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

/** The dearest tier each group offers, which the seeded design never carries — so asking for it is
 *  always a change, whatever order the book lists its tiers in. */
const ANOTHER_MATERIAL = MATERIAL_TIER_IDS.at(-1) ?? "";
const ANOTHER_HARDWARE = HARDWARE_TIER_IDS.at(-1) ?? "";

/** A declared depth the seeded design is not built at. Read from the map rather than written, so a
 *  third declared depth does not quietly make this a no-op. */
const ANOTHER_DEPTH_MM =
  declaredCabinetDepthsMm().find(
    (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
  ) ?? 0;

interface StoreOptions {
  /** Absent means no probe has attached, which is what makes a depth change refuse. */
  readonly hasProbe: boolean;
}

function storeFor(options: StoreOptions) {
  const saved: Design[] = [];
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    ...(options.hasProbe ? { probeAt: createFakeProbeFactory() } : {}),
    onDesignChanged: (design) => saved.push(design),
  });
  return { store, saved };
}

function everySetting(): {
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly cabinetDepthMm: number;
  readonly availableMaterialTierIds: readonly string[];
  readonly availableHardwareTierIds: readonly string[];
} {
  return {
    materialTierId: ANOTHER_MATERIAL,
    hardwareTierId: ANOTHER_HARDWARE,
    cabinetDepthMm: ANOTHER_DEPTH_MM,
    availableMaterialTierIds: MATERIAL_TIER_IDS,
    availableHardwareTierIds: HARDWARE_TIER_IDS,
  };
}

describe("a press whose depth half is refused", () => {
  it("commits nothing at all, so the material and hardware it also asked for are unchanged", () => {
    const { store, saved } = storeFor({ hasProbe: false });
    const before = store.getState().design;

    const outcome = store.getState().applyWholeKitchenSettings(everySetting());

    expect(outcome.committed).toBe(false);
    // The design object itself, not a field of it: a partial apply would have replaced it.
    expect(store.getState().design).toBe(before);
    expect(store.getState().design.settings?.materialTierId).not.toBe(
      ANOTHER_MATERIAL,
    );
    expect(store.getState().design.settings?.hardwareTierId).not.toBe(
      ANOTHER_HARDWARE,
    );
    expect(cabinetDepthMmOf(store.getState().design)).toBe(
      cabinetDepthMmOf(KITCHEN_L_DESIGN),
    );
    // And nothing was scheduled for saving, so the refusal cannot reach the server either.
    expect(saved).toEqual([]);
  });

  it("names the setting that refused, so the sheet can say which change it kept", () => {
    const { store } = storeFor({ hasProbe: false });

    const outcome = store.getState().applyWholeKitchenSettings(everySetting());

    if (outcome.committed) throw new Error("expected the depth half to refuse");
    expect(outcome.setting).toBe("cabinetDepth");
    expect(outcome.reason.code).toBe("BODY_PROBE_UNAVAILABLE");
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
  });

  it("is a case the two tier commands would each have succeeded in on their own", () => {
    // Without this the assertion above is vacuous: nothing would be proved by a press that commits
    // nothing if neither of its other halves could have committed anything either.
    const { store, saved } = storeFor({ hasProbe: false });

    const outcome = store.getState().applyWholeKitchenSettings({
      materialTierId: ANOTHER_MATERIAL,
      hardwareTierId: ANOTHER_HARDWARE,
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(true);
    expect(store.getState().design.settings?.materialTierId).toBe(
      ANOTHER_MATERIAL,
    );
    expect(store.getState().design.settings?.hardwareTierId).toBe(
      ANOTHER_HARDWARE,
    );
    expect(saved.length).toBe(1);
  });
});

describe("a press that commits", () => {
  it("reaches the save seam exactly once, however many settings it carried", () => {
    // The old shape scheduled a save per successful command. One press is one document, so it is
    // one write — which is also what makes "commit or nothing" observable from outside the store.
    const { store, saved } = storeFor({ hasProbe: true });

    const outcome = store.getState().applyWholeKitchenSettings(everySetting());

    expect(outcome.committed).toBe(true);
    expect(saved.length).toBe(1);
    expect(saved.at(0)?.settings?.materialTierId).toBe(ANOTHER_MATERIAL);
    expect(saved.at(0)?.settings?.hardwareTierId).toBe(ANOTHER_HARDWARE);
    expect(cabinetDepthMmOf(saved.at(0) ?? KITCHEN_L_DESIGN)).toBe(
      ANOTHER_DEPTH_MM,
    );
  });

  it("clears a refusal left on screen by an earlier press", () => {
    const { store } = storeFor({ hasProbe: true });
    store.getState().setWidth(Number.NaN);
    expect(store.getState().lastRejection).not.toBeNull();

    store.getState().applyWholeKitchenSettings({
      materialTierId: ANOTHER_MATERIAL,
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(store.getState().lastRejection).toBeNull();
  });
});

describe("a press that asks for nothing new", () => {
  it("writes nothing, so an untouched sheet cannot move updatedAt", () => {
    // `setMaterialTier` deliberately succeeds on a tier the design already carries, so this claim is
    // about the press and about nothing in the domain.
    const { store, saved } = storeFor({ hasProbe: true });
    const before = store.getState().design;

    const outcome = store.getState().applyWholeKitchenSettings({
      ...(before.settings?.materialTierId === undefined
        ? {}
        : { materialTierId: before.settings.materialTierId }),
      cabinetDepthMm: cabinetDepthMmOf(before),
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(true);
    expect(store.getState().design).toBe(before);
    expect(store.getState().design.updatedAt).toBe(before.updatedAt);
    expect(saved).toEqual([]);
  });

  it("does not stamp the book's defaults into a document that names no tier", () => {
    // The invariant M6-AUD-012's fix must not break: an absent choice stays absent.
    const { store, saved } = storeFor({ hasProbe: true });

    store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(store.getState().design.settings?.materialTierId).toBe(
      KITCHEN_L_DESIGN.settings?.materialTierId,
    );
    expect(saved).toEqual([]);
  });
});
