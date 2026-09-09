// **The seam the adapter's own suite cannot reach** — ADR 0099 Amendment A section 3.
//
// The scene-colour wave is proved in `packages/three-adapter` against records built by the real
// `derivePlacementRecords`, and in `packages/configurator-domain` against the resolver. Neither can
// answer the question the owner's rule actually turns on: **does the store re-derive its records
// when the kitchen's colour changes?** If it does not, `drawnFinish` is correct in a fresh render
// and stale in the running app, and every test in both packages still passes.
//
// The wave's own implementer named this gap and could not close it from either package. It is closed
// here, at the store, through `applyWholeKitchenSettings` — the seam the settings sheet presses.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  MATERIALS,
  paletteEntriesOf,
  type Finish,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const MELAMINE_ID = "material.melamine";

/** **Not the material's default, deliberately.** Melamine's declared default is *Alb*, whose hex is
 *  the same one M1 gives `kit.M.door` — so a test that applied the default would pass with the
 *  colour never reaching anything. The wave's own criterion 3 was found vacuous for exactly this
 *  reason and needed a second material to witness it (ADR 0093 decision 1). */
function aColourThatIsNotMelaminesDefault(): Finish {
  const melamine = MATERIALS.find((m) => m.materialId === MELAMINE_ID);
  if (!melamine) throw new Error(`${MELAMINE_ID} is not a declared material`);
  const entry = paletteEntriesOf(melamine).find(
    (candidate) => candidate.entryId !== "pal.alb",
  );
  if (!entry) throw new Error("melamine offers nothing but its default");
  return { kind: "palette-entry", entryId: entry.entryId };
}

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => "2026-09-05T12:00:00.000Z",
  });
}

type Store = ReturnType<typeof createStore>;

function drawnFinishOf(store: Store, placementId: string): Finish | undefined {
  return store.getState().records.find((r) => r.id === placementId)
    ?.drawnFinish;
}

/** **Key presence, never the value.** A value assertion passes while the key is being stamped, which
 *  is the whole failure mode ADR 0099 decision 2 forbids and Amendment A section 1 records. */
function hasChosenAColour(store: Store, placementId: string): boolean {
  const body = store
    .getState()
    .design.placements.find((p) => p.id === placementId)?.body;
  if (!body) throw new Error(`no placement ${placementId}`);
  return "finish" in body;
}

describe("the kitchen's colour reaches the records the scene draws", () => {
  it("re-derives a following cabinet's drawn colour when the kitchen's changes", () => {
    const store = createStore();
    const colour = aColourThatIsNotMelaminesDefault();

    // Non-vacuity: `p0` must be following, or the assertion below is about an override.
    expect(hasChosenAColour(store, "p0")).toBe(false);
    expect(drawnFinishOf(store, "p0")).not.toStrictEqual(colour);

    const outcome = store.getState().applyWholeKitchenSettings({
      materialTierId: MELAMINE_ID,
      finish: colour,
      availableMaterialTierIds: MATERIALS.map((m) => m.materialId),
      availableHardwareTierIds: [],
    });

    expect(outcome.committed).toBe(true);
    expect(drawnFinishOf(store, "p0")).toStrictEqual(colour);
  });

  it("leaves the cabinet following, so the next change moves it too", () => {
    const store = createStore();

    store.getState().applyWholeKitchenSettings({
      materialTierId: MELAMINE_ID,
      finish: aColourThatIsNotMelaminesDefault(),
      availableMaterialTierIds: MATERIALS.map((m) => m.materialId),
      availableHardwareTierIds: [],
    });

    // The point of the whole wave: drawing a cabinet in the kitchen's colour must not record that
    // colour as the cabinet's own choice. If this key appears, a later global change leaves this
    // cabinet behind — which is the owner's rule broken, silently.
    expect(hasChosenAColour(store, "p0")).toBe(false);
  });
});
